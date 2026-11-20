from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityEventType
from app.models.auction_config import AuctionConfig
from app.models.bid import Bid
from app.models.rfq import RFQ, RFQStatus
from app.models.user import User, UserRole
from app.schemas.bid import BidCreate, BidResponse, BidSubmissionResultResponse, RankingEntryResponse
from app.services.activity_service import ActivityService
from app.services.auction_engine import AuctionEngine
from app.services.rfq_service import RFQService
from app.utils.time import ensure_utc, utc_now
from app.websocket.manager import AuctionSocketClient, ws_manager


class BidService:
    @staticmethod
    def submit_bid_sync(
        db: Session,
        rfq_id: UUID,
        supplier: User,
        payload: BidCreate,
        now_override: datetime | None = None,
    ) -> tuple[BidSubmissionResultResponse, dict]:
        """Execute bid validation, persistence, ranking, extension, and audit logging atomically.

        Acquires a row-level `SELECT ... FOR UPDATE` lock on the target RFQ row so
        concurrent bids on the same RFQ are serialized while independent RFQs run in parallel.
        """
        now = ensure_utc(now_override or utc_now())

        # Acquire row-level exclusive lock on the RFQ row (PostgreSQL enforces FOR UPDATE)
        stmt = select(RFQ).where(RFQ.id == rfq_id)
        if db.bind and db.bind.dialect.name != "sqlite":
            stmt = stmt.with_for_update()

        rfq = db.scalar(stmt)
        if rfq is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found.")

        config = db.scalar(select(AuctionConfig).where(AuctionConfig.rfq_id == rfq.id))
        if config is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Auction configuration missing for RFQ.",
            )

        # Ensure status reflects start time if previously UPCOMING
        if rfq.status == RFQStatus.UPCOMING.value and ensure_utc(rfq.bid_start_time) <= now:
            rfq.status = RFQStatus.ACTIVE.value

        total_amount = (
            Decimal(payload.freight_charges)
            + Decimal(payload.origin_charges)
            + Decimal(payload.destination_charges)
        ).quantize(Decimal("0.01"))

        previous_bid = AuctionEngine.validate_bid_eligibility(
            db=db,
            rfq=rfq,
            supplier_id=supplier.id,
            total_amount=total_amount,
            now=now,
        )

        rankings_before = AuctionEngine.calculate_rankings(db, rfq.id)

        new_bid = Bid(
            rfq_id=rfq.id,
            supplier_id=supplier.id,
            carrier_name=payload.carrier_name.strip(),
            freight_charges=Decimal(payload.freight_charges).quantize(Decimal("0.01")),
            origin_charges=Decimal(payload.origin_charges).quantize(Decimal("0.01")),
            destination_charges=Decimal(payload.destination_charges).quantize(Decimal("0.01")),
            total_amount=total_amount,
            transit_time=payload.transit_time,
            validity_date=payload.validity_date,
            created_at=now,
        )
        db.add(new_bid)
        db.flush()

        rankings_after = AuctionEngine.calculate_rankings(db, rfq.id)
        extension = AuctionEngine.evaluate_extension(
            rfq=rfq,
            config=config,
            now=now,
            rankings_before=rankings_before,
            rankings_after=rankings_after,
        )

        # 1. Log BID_SUBMITTED
        ActivityService.log_event(
            db=db,
            rfq_id=rfq.id,
            bid_id=new_bid.id,
            event_type=ActivityEventType.BID_SUBMITTED,
            description=f"{supplier.name} submitted a quote of ${total_amount:,.2f} via {new_bid.carrier_name}.",
            old_value=(
                {"previous_total_amount": str(Decimal(previous_bid.total_amount))}
                if previous_bid is not None
                else None
            ),
            new_value={
                "supplier_id": str(supplier.id),
                "supplier_name": supplier.name,
                "carrier_name": new_bid.carrier_name,
                "total_amount": str(total_amount),
            },
            created_at=now,
        )

        # 2. Log RANK_CHANGED if ranking order changed
        before_order = [entry.bid.supplier_id for entry in rankings_before]
        after_order = [entry.bid.supplier_id for entry in rankings_after]
        ranking_changed = before_order != after_order
        if ranking_changed:
            old_l1 = rankings_before[0] if rankings_before else None
            new_l1 = rankings_after[0]
            l1_flipped = (old_l1.bid.supplier_id if old_l1 else None) != new_l1.bid.supplier_id
            rank_desc = (
                f"Lowest bidder (L1) changed to {new_l1.supplier_name} at ${Decimal(new_l1.bid.total_amount):,.2f}."
                if l1_flipped
                else f"Supplier rankings updated after {supplier.name}'s bid of ${total_amount:,.2f}."
            )
            ActivityService.log_event(
                db=db,
                rfq_id=rfq.id,
                bid_id=new_bid.id,
                event_type=ActivityEventType.RANK_CHANGED,
                description=rank_desc,
                old_value=(
                    {
                        "l1_supplier_id": str(old_l1.bid.supplier_id),
                        "l1_supplier_name": old_l1.supplier_name,
                        "l1_amount": str(Decimal(old_l1.bid.total_amount)),
                    }
                    if old_l1
                    else None
                ),
                new_value={
                    "l1_supplier_id": str(new_l1.bid.supplier_id),
                    "l1_supplier_name": new_l1.supplier_name,
                    "l1_amount": str(Decimal(new_l1.bid.total_amount)),
                    "supplier_id": str(supplier.id),
                    "supplier_name": supplier.name,
                },
                created_at=now,
            )

        # 3. Persist auction extension if triggered
        if extension.extended:
            rfq.bid_close_time = extension.new_close_time
            reasons_text = ", ".join(extension.reasons)
            cap_note = " (capped at forced close time)" if extension.capped_at_forced_close else ""
            ActivityService.log_event(
                db=db,
                rfq_id=rfq.id,
                bid_id=new_bid.id,
                event_type=ActivityEventType.AUCTION_EXTENDED,
                description=(
                    f"Auction extended by {config.extension_duration_minutes} min "
                    f"due to {reasons_text}{cap_note}."
                ),
                old_value={"bid_close_time": extension.previous_close_time.isoformat()},
                new_value={
                    "bid_close_time": extension.new_close_time.isoformat(),
                    "forced_close_time": ensure_utc(rfq.forced_close_time).isoformat(),
                    "reasons": extension.reasons,
                    "capped_at_forced_close": extension.capped_at_forced_close,
                },
                created_at=now,
            )

        # Commit transaction atomically BEFORE returning or broadcasting
        db.commit()
        db.refresh(new_bid)
        db.refresh(rfq)

        alias_map = AuctionEngine.build_supplier_alias_map(db, rfq.id)
        serialized_bid = AuctionEngine.serialize_bid(new_bid, supplier.name, supplier.role, supplier.id, alias_map)
        serialized_rankings = AuctionEngine.serialize_rankings(rankings_after, supplier.role, supplier.id, alias_map)

        result = BidSubmissionResultResponse(
            bid=serialized_bid,
            rankings=serialized_rankings,
            auction_extended=extension.extended,
            extension_reasons=extension.reasons,
            previous_close_time=extension.previous_close_time,
            current_close_time=ensure_utc(rfq.bid_close_time),
            forced_close_time=ensure_utc(rfq.forced_close_time),
            server_time=now,
        )

        broadcast_context = {
            "bid": new_bid,
            "supplier_name": supplier.name,
            "rankings_after": rankings_after,
            "alias_map": alias_map,
            "extension": extension,
            "rfq": rfq,
            "server_time": now,
        }
        return result, broadcast_context

    @staticmethod
    async def submit_bid(
        db: Session,
        rfq_id: UUID,
        supplier: User,
        payload: BidCreate,
    ) -> BidSubmissionResultResponse:
        result, ctx = BidService.submit_bid_sync(db, rfq_id, supplier, payload)

        # Broadcast strictly AFTER database commit succeeded
        bid: Bid = ctx["bid"]
        supplier_name: str = ctx["supplier_name"]
        rankings_after = ctx["rankings_after"]
        alias_map: dict[UUID, str] = ctx["alias_map"]
        extension = ctx["extension"]
        rfq: RFQ = ctx["rfq"]
        now: datetime = ctx["server_time"]

        def build_bid_payload(client: AuctionSocketClient) -> dict:
            return {
                "bid": AuctionEngine.serialize_bid(
                    bid, supplier_name, client.role, client.user_id, alias_map
                ).model_dump(mode="json"),
                "server_time": now.isoformat(),
            }

        def build_ranking_payload(client: AuctionSocketClient) -> dict:
            return {
                "rankings": [
                    entry.model_dump(mode="json")
                    for entry in AuctionEngine.serialize_rankings(
                        rankings_after, client.role, client.user_id, alias_map
                    )
                ],
                "server_time": now.isoformat(),
            }

        await ws_manager.broadcast_event(rfq_id, "NEW_BID", build_bid_payload)
        await ws_manager.broadcast_event(rfq_id, "RANKING_UPDATED", build_ranking_payload)

        if extension.extended:
            await ws_manager.broadcast_event(
                rfq_id,
                "AUCTION_EXTENDED",
                lambda _client: {
                    "previous_close_time": extension.previous_close_time.isoformat(),
                    "bid_close_time": ensure_utc(rfq.bid_close_time).isoformat(),
                    "forced_close_time": ensure_utc(rfq.forced_close_time).isoformat(),
                    "reasons": extension.reasons,
                    "capped_at_forced_close": extension.capped_at_forced_close,
                    "server_time": now.isoformat(),
                },
            )

        return result

    @staticmethod
    def list_bids(db: Session, rfq_id: UUID, user: User) -> list[BidResponse]:
        RFQService.verify_rfq_access(db, rfq_id, user)
        alias_map = AuctionEngine.build_supplier_alias_map(db, rfq_id)

        query = (
            select(Bid, User.name)
            .join(User, User.id == Bid.supplier_id)
            .where(Bid.rfq_id == rfq_id)
            .order_by(Bid.created_at.desc(), Bid.id.desc())
        )
        # Suppliers see their own full historical bids; buyers see all historical bids
        if user.role == UserRole.SUPPLIER.value:
            query = query.where(Bid.supplier_id == user.id)

        rows = db.execute(query).all()
        return [
            AuctionEngine.serialize_bid(bid, supplier_name, user.role, user.id, alias_map)
            for bid, supplier_name in rows
        ]

    @staticmethod
    def get_rankings(db: Session, rfq_id: UUID, user: User) -> list[RankingEntryResponse]:
        RFQService.verify_rfq_access(db, rfq_id, user)
        rankings = AuctionEngine.calculate_rankings(db, rfq_id)
        alias_map = AuctionEngine.build_supplier_alias_map(db, rfq_id)
        return AuctionEngine.serialize_rankings(rankings, user.role, user.id, alias_map)
