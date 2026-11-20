from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityEventType, AuctionActivityLog
from app.models.user import UserRole
from app.schemas.auction import ActivityLogResponse
from app.utils.time import ensure_utc, utc_now


class ActivityService:
    @staticmethod
    def log_event(
        db: Session,
        rfq_id: UUID,
        event_type: ActivityEventType,
        description: str,
        bid_id: UUID | None = None,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
        created_at=None,
    ) -> AuctionActivityLog:
        entry = AuctionActivityLog(
            rfq_id=rfq_id,
            bid_id=bid_id,
            event_type=event_type.value,
            description=description,
            old_value=old_value,
            new_value=new_value,
            created_at=ensure_utc(created_at) if created_at else utc_now(),
        )
        db.add(entry)
        return entry

    @staticmethod
    def list_activity_logs(
        db: Session,
        rfq_id: UUID,
        viewer_role: str,
        viewer_id: UUID,
        alias_map: dict[UUID, str],
    ) -> list[ActivityLogResponse]:
        logs = db.scalars(
            select(AuctionActivityLog)
            .where(AuctionActivityLog.rfq_id == rfq_id)
            .order_by(AuctionActivityLog.created_at.desc(), AuctionActivityLog.id.desc())
        ).all()

        is_buyer = viewer_role == UserRole.BUYER.value
        responses: list[ActivityLogResponse] = []
        for log in logs:
            description = log.description
            old_val = dict(log.old_value) if isinstance(log.old_value, dict) else log.old_value
            new_val = dict(log.new_value) if isinstance(log.new_value, dict) else log.new_value

            if not is_buyer:
                # Redact competitor real names in supplier-visible activity feeds
                if isinstance(new_val, dict) and "supplier_id" in new_val:
                    sid = UUID(str(new_val["supplier_id"]))
                    display = "You" if sid == viewer_id else alias_map.get(sid, "Competitor")
                    if "supplier_name" in new_val and new_val["supplier_name"]:
                        description = description.replace(str(new_val["supplier_name"]), display)
                        new_val["supplier_name"] = display
                    if sid != viewer_id:
                        new_val.pop("supplier_id", None)
                if isinstance(old_val, dict) and "l1_supplier_name" in old_val and old_val.get("l1_supplier_id"):
                    old_sid = UUID(str(old_val["l1_supplier_id"]))
                    old_display = "You" if old_sid == viewer_id else alias_map.get(old_sid, "Competitor")
                    description = description.replace(str(old_val["l1_supplier_name"]), old_display)
                    old_val["l1_supplier_name"] = old_display
                    if old_sid != viewer_id:
                        old_val.pop("l1_supplier_id", None)
                if isinstance(new_val, dict) and "l1_supplier_name" in new_val and new_val.get("l1_supplier_id"):
                    new_sid = UUID(str(new_val["l1_supplier_id"]))
                    new_display = "You" if new_sid == viewer_id else alias_map.get(new_sid, "Competitor")
                    description = description.replace(str(new_val["l1_supplier_name"]), new_display)
                    new_val["l1_supplier_name"] = new_display
                    if new_sid != viewer_id:
                        new_val.pop("l1_supplier_id", None)

            responses.append(
                ActivityLogResponse(
                    id=log.id,
                    rfq_id=log.rfq_id,
                    bid_id=log.bid_id,
                    event_type=log.event_type,
                    description=description,
                    old_value=old_val,
                    new_value=new_val,
                    created_at=ensure_utc(log.created_at),
                )
            )
        return responses
