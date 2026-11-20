from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.schemas.bid import RankingEntryResponse
from app.schemas.rfq import RFQDetailResponse


class ActivityLogResponse(BaseModel):
    id: UUID
    rfq_id: UUID
    bid_id: UUID | None = None
    event_type: str
    description: str
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    created_at: datetime


class AuctionStateResponse(BaseModel):
    rfq: RFQDetailResponse
    rankings: list[RankingEntryResponse]
    in_trigger_window: bool
    time_remaining_seconds: int
    server_time: datetime
