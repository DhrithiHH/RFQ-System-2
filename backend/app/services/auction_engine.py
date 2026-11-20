from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auction_config import AuctionConfig
from app.models.bid import Bid
from app.models.rfq import RFQ, RFQStatus
from app.models.rfq_supplier import RFQSupplier
from app.models.user import User, UserRole
from app.schemas.bid import BidResponse, RankingEntryResponse
from app.utils.time import ensure_utc, utc_now


@dataclass(frozen=True)
class RankedBid:
    rank: int
    bid: Bid
    supplier_name: str


@dataclass(frozen=True)
class ExtensionEvaluation:
    extended: bool
    reasons: list[str]
    previous_close_time: datetime
    new_close_time: datetime
    capped_at_forced_close: bool


class AuctionEngine:
    """Centralized domain engine for British Auction rules, rankings, and extensions."""

    @staticmethod
    def compute_effective_status(rfq: RFQ, now: datetime | None = None) -> RFQStatus:
        """Authoritatively compute RFQ status from server UTC clock."""
        current = ensure_utc(now or utc_now())
        start = ensure_utc(rfq.bid_start_time)
        close = ensure_utc(rfq.bid_close_time)
        forced = ensure_utc(rfq.forced_close_time)

        if rfq.status == RFQStatus.FORCE_CLOSED.value:
            return RFQStatus.FORCE_CLOSED
        if rfq.status == RFQStatus.CLOSED.value:
            return RFQStatus.CLOSED
        if current < start:
            return RFQStatus.UPCOMING
        if current >= forced:
            return RFQStatus.FORCE_CLOSED
        if current >= close:
            # If extensions reached forced_close_time, classify as FORCE_CLOSED.
            if close >= forced:
                return RFQStatus.FORCE_CLOSED
            return RFQStatus.CLOSED
        return RFQStatus.ACTIVE

    @staticmethod
    def sync_rfq_status(rfq: RFQ, now: datetime | None = None) -> tuple[RFQStatus, bool]:
        """Update rfq.status in-place if the clock crossed a lifecycle boundary."""
        effective = AuctionEngine.compute_effective_status(rfq, now)
        changed = rfq.status != effective.value
        if changed:
            rfq.status = effective.value
        return effective, changed

    @staticmethod
    def is_in_trigger_window(rfq: RFQ, config: AuctionConfig, now: datetime) -> bool:
        current = ensure_utc(now)
        close = ensure_utc(rfq.bid_close_time)
        window_start = close - timedelta(minutes=config.trigger_window_minutes)
        return window_start <= current < close

    @staticmethod
    def validate_bid_eligibility(
        db: Session,
        rfq: RFQ,
        supplier_id: UUID,
        total_amount: Decimal,
        now: datetime,
    ) -> Bid | None:
        """Validate invitation, active window, forced close, and strict price reduction.

        Returns the supplier's previous latest bid (if any).
        """
        invitation = db.scalar(
            select(RFQSupplier).where(
                RFQSupplier.rfq_id == rfq.id,
                RFQSupplier.supplier_id == supplier_id,
            )
        )
        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Supplier is not invited to this RFQ.",
            )

        current = ensure_utc(now)
        start = ensure_utc(rfq.bid_start_time)
        close = ensure_utc(rfq.bid_close_time)
        forced = ensure_utc(rfq.forced_close_time)

        if current < start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Auction has not started yet.",
            )

        if rfq.status in (RFQStatus.CLOSED.value, RFQStatus.FORCE_CLOSED.value):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Auction is already {rfq.status.lower().replace('_', ' ')}.",
            )

        if current >= forced:
            rfq.status = RFQStatus.FORCE_CLOSED.value
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Auction has reached its forced close time and no longer accepts bids.",
            )

        if current >= close:
            rfq.status = RFQStatus.CLOSED.value
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Auction bidding window has closed.",
            )

        previous_bid = db.scalar(
            select(Bid)
            .where(Bid.rfq_id == rfq.id, Bid.supplier_id == supplier_id)
            .order_by(Bid.created_at.desc(), Bid.id.desc())
            .limit(1)
        )
        if previous_bid is not None and total_amount >= Decimal(previous_bid.total_amount):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"New quotation total ({total_amount:.2f}) must be strictly lower than your "
                    f"previous bid ({Decimal(previous_bid.total_amount):.2f})."
                ),
            )

        return previous_bid

    @staticmethod
    def calculate_rankings(db: Session, rfq_id: UUID) -> list[RankedBid]:
        """Compute L1, L2, L3... rankings from each supplier's latest accepted bid.

        Tie-breaking rule: ascending total_amount, then earliest created_at, then bid id.
        """
        rows = db.execute(
            select(Bid, User.name)
            .join(User, User.id == Bid.supplier_id)
            .where(Bid.rfq_id == rfq_id)
            .order_by(Bid.created_at.desc(), Bid.id.desc())
        ).all()

        latest_by_supplier: dict[UUID, tuple[Bid, str]] = {}
        for bid, supplier_name in rows:
            if bid.supplier_id not in latest_by_supplier:
                latest_by_supplier[bid.supplier_id] = (bid, supplier_name)

        ordered = sorted(
            latest_by_supplier.values(),
            key=lambda item: (Decimal(item[0].total_amount), ensure_utc(item[0].created_at), str(item[0].id)),
        )

        return [
            RankedBid(rank=idx, bid=bid, supplier_name=supplier_name)
            for idx, (bid, supplier_name) in enumerate(ordered, start=1)
        ]

    @staticmethod
    def evaluate_extension(
        rfq: RFQ,
        config: AuctionConfig,
        now: datetime,
        rankings_before: list[RankedBid],
        rankings_after: list[RankedBid],
    ) -> ExtensionEvaluation:
        """Evaluate British Auction triggers and compute capped extension closing time."""
        current = ensure_utc(now)
        current_close = ensure_utc(rfq.bid_close_time)
        forced_close = ensure_utc(rfq.forced_close_time)

        if not AuctionEngine.is_in_trigger_window(rfq, config, current):
            return ExtensionEvaluation(
                extended=False,
                reasons=[],
                previous_close_time=current_close,
                new_close_time=current_close,
                capped_at_forced_close=False,
            )

        before_order = [entry.bid.supplier_id for entry in rankings_before]
        after_order = [entry.bid.supplier_id for entry in rankings_after]
        any_rank_changed = before_order != after_order

        before_l1 = before_order[0] if before_order else None
        after_l1 = after_order[0] if after_order else None
        l1_changed = before_l1 != after_l1

        reasons: list[str] = []
        if config.bid_received_enabled:
            reasons.append("BID_RECEIVED")
        if config.any_rank_change_enabled and any_rank_changed:
            reasons.append("ANY_RANK_CHANGE")
        if config.l1_rank_change_enabled and l1_changed:
            reasons.append("L1_RANK_CHANGE")

        if not reasons:
            return ExtensionEvaluation(
                extended=False,
                reasons=[],
                previous_close_time=current_close,
                new_close_time=current_close,
                capped_at_forced_close=False,
            )

        candidate_close = current_close + timedelta(minutes=config.extension_duration_minutes)
        new_close = min(candidate_close, forced_close)
        capped = candidate_close > forced_close

        if new_close <= current_close:
            return ExtensionEvaluation(
                extended=False,
                reasons=[],
                previous_close_time=current_close,
                new_close_time=current_close,
                capped_at_forced_close=True,
            )

        return ExtensionEvaluation(
            extended=True,
            reasons=reasons,
            previous_close_time=current_close,
            new_close_time=new_close,
            capped_at_forced_close=capped,
        )

    @staticmethod
    def build_supplier_alias_map(db: Session, rfq_id: UUID) -> dict[UUID, str]:
        """Assign deterministic anonymous labels (Supplier A, Supplier B...) per RFQ."""
        invitations = db.scalars(
            select(RFQSupplier)
            .where(RFQSupplier.rfq_id == rfq_id)
            .order_by(RFQSupplier.invited_at.asc(), RFQSupplier.id.asc())
        ).all()
        aliases: dict[UUID, str] = {}
        for idx, inv in enumerate(invitations):
            letter = chr(ord("A") + (idx % 26))
            suffix = "" if idx < 26 else f" {idx // 26 + 1}"
            aliases[inv.supplier_id] = f"Supplier {letter}{suffix}"
        return aliases

    @staticmethod
    def serialize_rankings(
        rankings: list[RankedBid],
        viewer_role: str,
        viewer_id: UUID,
        alias_map: dict[UUID, str],
    ) -> list[RankingEntryResponse]:
        is_buyer = viewer_role == UserRole.BUYER.value
        serialized: list[RankingEntryResponse] = []
        for entry in rankings:
            is_self = entry.bid.supplier_id == viewer_id
            if is_buyer:
                label = entry.supplier_name
                exposed_supplier_id: UUID | None = entry.bid.supplier_id
            elif is_self:
                label = f"{entry.supplier_name} (You)"
                exposed_supplier_id = entry.bid.supplier_id
            else:
                label = alias_map.get(entry.bid.supplier_id, f"Supplier {entry.rank}")
                exposed_supplier_id = None

            serialized.append(
                RankingEntryResponse(
                    rank=entry.rank,
                    rank_label=f"L{entry.rank}",
                    supplier_id=exposed_supplier_id,
                    supplier_label=label,
                    is_current_user=is_self,
                    bid_id=entry.bid.id,
                    carrier_name=entry.bid.carrier_name,
                    freight_charges=Decimal(entry.bid.freight_charges),
                    origin_charges=Decimal(entry.bid.origin_charges),
                    destination_charges=Decimal(entry.bid.destination_charges),
                    total_amount=Decimal(entry.bid.total_amount),
                    transit_time=entry.bid.transit_time,
                    validity_date=entry.bid.validity_date,
                    submitted_at=ensure_utc(entry.bid.created_at),
                )
            )
        return serialized

    @staticmethod
    def serialize_bid(
        bid: Bid,
        supplier_name: str,
        viewer_role: str,
        viewer_id: UUID,
        alias_map: dict[UUID, str],
    ) -> BidResponse:
        is_buyer = viewer_role == UserRole.BUYER.value
        is_self = bid.supplier_id == viewer_id
        if is_buyer:
            label = supplier_name
            exposed_supplier_id: UUID | None = bid.supplier_id
        elif is_self:
            label = f"{supplier_name} (You)"
            exposed_supplier_id = bid.supplier_id
        else:
            label = alias_map.get(bid.supplier_id, "Competitor")
            exposed_supplier_id = None

        return BidResponse(
            id=bid.id,
            rfq_id=bid.rfq_id,
            supplier_id=exposed_supplier_id,
            supplier_label=label,
            is_current_user=is_self,
            carrier_name=bid.carrier_name,
            freight_charges=Decimal(bid.freight_charges),
            origin_charges=Decimal(bid.origin_charges),
            destination_charges=Decimal(bid.destination_charges),
            total_amount=Decimal(bid.total_amount),
            transit_time=bid.transit_time,
            validity_date=bid.validity_date,
            created_at=ensure_utc(bid.created_at),
        )
