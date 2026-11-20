from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.activity_log import ActivityEventType, AuctionActivityLog
from app.models.auction_config import AuctionConfig
from app.models.bid import Bid
from app.models.rfq import RFQ, RFQStatus
from app.models.rfq_supplier import InvitationStatus, RFQSupplier
from app.models.user import User, UserRole
from app.schemas.auction import AuctionStateResponse
from app.schemas.rfq import (
    AuctionConfigResponse,
    InvitedSupplierResponse,
    RFQCreate,
    RFQDetailResponse,
    RFQSummaryResponse,
)
from app.services.activity_service import ActivityService
from app.services.auction_engine import AuctionEngine
from app.utils.time import ensure_utc, utc_now


class RFQService:
    @staticmethod
    def create_rfq(db: Session, buyer: User, payload: RFQCreate) -> RFQDetailResponse:
        now = utc_now()
        initial_status = RFQStatus.ACTIVE.value if payload.bid_start_time <= now else RFQStatus.UPCOMING.value

        rfq = RFQ(
            buyer_id=buyer.id,
            name=payload.name.strip(),
            reference_id=payload.reference_id.strip(),
            bid_start_time=payload.bid_start_time,
            initial_bid_close_time=payload.bid_close_time,
            bid_close_time=payload.bid_close_time,
            forced_close_time=payload.forced_close_time,
            pickup_date=payload.pickup_date,
            origin=payload.origin.strip(),
            destination=payload.destination.strip(),
            status=initial_status,
        )
        db.add(rfq)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"RFQ reference_id '{payload.reference_id}' already exists.",
            ) from exc

        config = AuctionConfig(
            rfq_id=rfq.id,
            trigger_window_minutes=payload.auction_config.trigger_window_minutes,
            extension_duration_minutes=payload.auction_config.extension_duration_minutes,
            bid_received_enabled=payload.auction_config.bid_received_enabled,
            any_rank_change_enabled=payload.auction_config.any_rank_change_enabled,
            l1_rank_change_enabled=payload.auction_config.l1_rank_change_enabled,
        )
        db.add(config)

        unique_supplier_ids = list(dict.fromkeys(payload.supplier_ids))
        if unique_supplier_ids:
            RFQService._attach_suppliers(db, rfq.id, unique_supplier_ids)

        db.commit()
        return RFQService.get_rfq_detail(db, rfq.id, buyer)

    @staticmethod
    def _attach_suppliers(db: Session, rfq_id: UUID, supplier_ids: list[UUID]) -> list[RFQSupplier]:
        suppliers = db.scalars(
            select(User).where(User.id.in_(supplier_ids), User.role == UserRole.SUPPLIER.value)
        ).all()
        found_ids = {user.id for user in suppliers}
        missing = [str(sid) for sid in supplier_ids if sid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or non-supplier user IDs: {', '.join(missing)}",
            )

        existing = set(
            db.scalars(
                select(RFQSupplier.supplier_id).where(
                    RFQSupplier.rfq_id == rfq_id,
                    RFQSupplier.supplier_id.in_(supplier_ids),
                )
            ).all()
        )

        created: list[RFQSupplier] = []
        for sid in supplier_ids:
            if sid in existing:
                continue
            inv = RFQSupplier(
                rfq_id=rfq_id,
                supplier_id=sid,
                invitation_status=InvitationStatus.INVITED.value,
            )
            db.add(inv)
            created.append(inv)
        return created

    @staticmethod
    def invite_suppliers(db: Session, rfq_id: UUID, buyer: User, supplier_ids: list[UUID]) -> RFQDetailResponse:
        rfq = db.get(RFQ, rfq_id)
        if rfq is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found.")
        if rfq.buyer_id != buyer.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this RFQ.")

        RFQService._attach_suppliers(db, rfq.id, list(dict.fromkeys(supplier_ids)))
        db.commit()
        return RFQService.get_rfq_detail(db, rfq.id, buyer)

    @staticmethod
    def verify_rfq_access(db: Session, rfq_id: UUID, user: User) -> RFQ:
        rfq = db.scalar(
            select(RFQ)
            .options(joinedload(RFQ.auction_config), joinedload(RFQ.invited_suppliers).joinedload(RFQSupplier.supplier))
            .where(RFQ.id == rfq_id)
        )
        if rfq is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFQ not found.")

        if user.role == UserRole.BUYER.value:
            if rfq.buyer_id != user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this RFQ.")
        else:
            invited = any(inv.supplier_id == user.id for inv in rfq.invited_suppliers)
            if not invited:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not invited to this RFQ.")

        now = utc_now()
        old_status = rfq.status
        effective, changed = AuctionEngine.sync_rfq_status(rfq, now)
        if changed:
            if effective in (RFQStatus.CLOSED, RFQStatus.FORCE_CLOSED) and old_status != effective.value:
                event_type = (
                    ActivityEventType.AUCTION_FORCE_CLOSED
                    if effective == RFQStatus.FORCE_CLOSED
                    else ActivityEventType.AUCTION_CLOSED
                )
                ActivityService.log_event(
                    db=db,
                    rfq_id=rfq.id,
                    event_type=event_type,
                    description=(
                        "Auction reached forced close limit and closed."
                        if effective == RFQStatus.FORCE_CLOSED
                        else "Auction bidding window closed."
                    ),
                    old_value={"status": old_status},
                    new_value={"status": effective.value, "closed_at": now.isoformat()},
                    created_at=now,
                )
            db.commit()
        return rfq

    @staticmethod
    def _build_summary(db: Session, rfq: RFQ, now) -> RFQSummaryResponse:
        rankings = AuctionEngine.calculate_rankings(db, rfq.id)
        lowest_bid = Decimal(rankings[0].bid.total_amount) if rankings else None
        total_bids = db.scalar(select(func.count(Bid.id)).where(Bid.rfq_id == rfq.id)) or 0
        invited_count = db.scalar(select(func.count(RFQSupplier.id)).where(RFQSupplier.rfq_id == rfq.id)) or 0
        extension_count = (
            db.scalar(
                select(func.count(AuctionActivityLog.id)).where(
                    AuctionActivityLog.rfq_id == rfq.id,
                    AuctionActivityLog.event_type == ActivityEventType.AUCTION_EXTENDED.value,
                )
            )
            or 0
        )

        return RFQSummaryResponse(
            id=rfq.id,
            buyer_id=rfq.buyer_id,
            name=rfq.name,
            reference_id=rfq.reference_id,
            origin=rfq.origin,
            destination=rfq.destination,
            pickup_date=rfq.pickup_date,
            bid_start_time=ensure_utc(rfq.bid_start_time),
            initial_bid_close_time=ensure_utc(rfq.initial_bid_close_time),
            bid_close_time=ensure_utc(rfq.bid_close_time),
            forced_close_time=ensure_utc(rfq.forced_close_time),
            status=AuctionEngine.compute_effective_status(rfq, now),
            lowest_bid_amount=lowest_bid,
            total_bids=total_bids,
            invited_count=invited_count,
            extension_count=extension_count,
            server_time=now,
        )

    @staticmethod
    def list_rfqs(db: Session, user: User) -> list[RFQSummaryResponse]:
        now = utc_now()
        if user.role == UserRole.BUYER.value:
            rfqs = db.scalars(
                select(RFQ).where(RFQ.buyer_id == user.id).order_by(RFQ.created_at.desc())
            ).all()
        else:
            rfqs = db.scalars(
                select(RFQ)
                .join(RFQSupplier, RFQSupplier.rfq_id == RFQ.id)
                .where(RFQSupplier.supplier_id == user.id)
                .order_by(RFQ.created_at.desc())
            ).all()

        dirty = False
        for rfq in rfqs:
            _, changed = AuctionEngine.sync_rfq_status(rfq, now)
            if changed:
                dirty = True
        if dirty:
            db.commit()

        return [RFQService._build_summary(db, rfq, now) for rfq in rfqs]

    @staticmethod
    def get_rfq_detail(db: Session, rfq_id: UUID, user: User) -> RFQDetailResponse:
        rfq = RFQService.verify_rfq_access(db, rfq_id, user)
        now = utc_now()
        summary = RFQService._build_summary(db, rfq, now)
        config_response = AuctionConfigResponse.model_validate(rfq.auction_config)

        invited_list: list[InvitedSupplierResponse] = []
        if user.role == UserRole.BUYER.value:
            for inv in sorted(rfq.invited_suppliers, key=lambda item: item.invited_at):
                invited_list.append(
                    InvitedSupplierResponse(
                        supplier_id=inv.supplier_id,
                        name=inv.supplier.name,
                        email=inv.supplier.email,
                        invitation_status=inv.invitation_status,
                        invited_at=ensure_utc(inv.invited_at),
                    )
                )

        return RFQDetailResponse(
            **summary.model_dump(),
            auction_config=config_response,
            invited_suppliers=invited_list,
        )

    @staticmethod
    def get_auction_state(db: Session, rfq_id: UUID, user: User) -> AuctionStateResponse:
        rfq = RFQService.verify_rfq_access(db, rfq_id, user)
        now = utc_now()
        detail = RFQService.get_rfq_detail(db, rfq_id, user)
        rankings = AuctionEngine.calculate_rankings(db, rfq.id)
        alias_map = AuctionEngine.build_supplier_alias_map(db, rfq.id)
        serialized_rankings = AuctionEngine.serialize_rankings(rankings, user.role, user.id, alias_map)

        in_window = (
            detail.status == RFQStatus.ACTIVE
            and AuctionEngine.is_in_trigger_window(rfq, rfq.auction_config, now)
        )
        effective_close = min(ensure_utc(rfq.bid_close_time), ensure_utc(rfq.forced_close_time))
        remaining = max(0, int((effective_close - now).total_seconds())) if detail.status == RFQStatus.ACTIVE else 0

        return AuctionStateResponse(
            rfq=detail,
            rankings=serialized_rankings,
            in_trigger_window=in_window,
            time_remaining_seconds=remaining,
            server_time=now,
        )
