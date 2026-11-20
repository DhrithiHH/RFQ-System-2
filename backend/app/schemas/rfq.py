from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.rfq import RFQStatus
from app.utils.time import ensure_utc


class AuctionConfigCreate(BaseModel):
    trigger_window_minutes: int = Field(..., gt=0, description="Trigger window X in minutes")
    extension_duration_minutes: int = Field(..., gt=0, description="Extension duration Y in minutes")
    bid_received_enabled: bool = True
    any_rank_change_enabled: bool = False
    l1_rank_change_enabled: bool = False

    @model_validator(mode="after")
    def validate_at_least_one_trigger(self) -> "AuctionConfigCreate":
        if not (self.bid_received_enabled or self.any_rank_change_enabled or self.l1_rank_change_enabled):
            raise ValueError("At least one auction extension trigger must be enabled.")
        return self


class AuctionConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rfq_id: UUID
    trigger_window_minutes: int
    extension_duration_minutes: int
    bid_received_enabled: bool
    any_rank_change_enabled: bool
    l1_rank_change_enabled: bool


class RFQCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=200)
    reference_id: str = Field(..., min_length=2, max_length=64)
    bid_start_time: datetime
    bid_close_time: datetime
    forced_close_time: datetime
    pickup_date: date
    origin: str = Field(..., min_length=2, max_length=150)
    destination: str = Field(..., min_length=2, max_length=150)
    supplier_ids: list[UUID] = Field(default_factory=list)
    auction_config: AuctionConfigCreate

    @model_validator(mode="after")
    def validate_times(self) -> "RFQCreate":
        start = ensure_utc(self.bid_start_time)
        close = ensure_utc(self.bid_close_time)
        forced = ensure_utc(self.forced_close_time)
        if start >= close:
            raise ValueError("bid_start_time must be strictly before bid_close_time.")
        if forced <= close:
            raise ValueError("forced_close_time must be strictly later than bid_close_time.")
        self.bid_start_time = start
        self.bid_close_time = close
        self.forced_close_time = forced
        return self


class InviteSuppliersRequest(BaseModel):
    supplier_ids: list[UUID] = Field(..., min_length=1)


class InvitedSupplierResponse(BaseModel):
    supplier_id: UUID
    name: str
    email: str
    invitation_status: str
    invited_at: datetime


class RFQSummaryResponse(BaseModel):
    id: UUID
    buyer_id: UUID
    name: str
    reference_id: str
    origin: str
    destination: str
    pickup_date: date
    bid_start_time: datetime
    initial_bid_close_time: datetime
    bid_close_time: datetime
    forced_close_time: datetime
    status: RFQStatus
    lowest_bid_amount: Decimal | None = None
    total_bids: int = 0
    invited_count: int = 0
    extension_count: int = 0
    server_time: datetime


class RFQDetailResponse(RFQSummaryResponse):
    auction_config: AuctionConfigResponse
    invited_suppliers: list[InvitedSupplierResponse] = Field(default_factory=list)
