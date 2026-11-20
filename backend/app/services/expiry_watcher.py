import asyncio
import logging

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models.activity_log import ActivityEventType
from app.models.rfq import RFQ, RFQStatus
from app.services.activity_service import ActivityService
from app.services.auction_engine import AuctionEngine
from app.utils.time import ensure_utc, utc_now
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)


async def run_expiry_watcher(stop_event: asyncio.Event) -> None:
    """Periodic watcher that closes expired ACTIVE auctions and broadcasts closure events."""
    while not stop_event.is_set():
        try:
            await sweep_expired_auctions()
        except Exception:
            logger.exception("Error during auction expiry sweep")
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=max(1, settings.expiry_watcher_interval_seconds),
            )
        except asyncio.TimeoutError:
            continue


async def sweep_expired_auctions() -> None:
    now = utc_now()
    events_to_broadcast: list[tuple] = []

    with SessionLocal() as db:
        candidates = db.scalars(
            select(RFQ).where(RFQ.status.in_([RFQStatus.UPCOMING.value, RFQStatus.ACTIVE.value]))
        ).all()

        for rfq in candidates:
            old_status = rfq.status
            effective, changed = AuctionEngine.sync_rfq_status(rfq, now)
            if not changed:
                continue

            if effective in (RFQStatus.CLOSED, RFQStatus.FORCE_CLOSED):
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
                        "Auction reached forced close limit and was automatically closed."
                        if effective == RFQStatus.FORCE_CLOSED
                        else "Auction bidding window expired and closed."
                    ),
                    old_value={"status": old_status},
                    new_value={
                        "status": effective.value,
                        "bid_close_time": ensure_utc(rfq.bid_close_time).isoformat(),
                        "forced_close_time": ensure_utc(rfq.forced_close_time).isoformat(),
                    },
                    created_at=now,
                )
                events_to_broadcast.append((rfq.id, event_type.value, effective.value))

        if candidates:
            db.commit()

    for rfq_id, ws_event, new_status in events_to_broadcast:
        await ws_manager.broadcast_event(
            rfq_id,
            ws_event,
            lambda _client, st=new_status: {
                "status": st,
                "closed_at": now.isoformat(),
                "server_time": now.isoformat(),
            },
        )
