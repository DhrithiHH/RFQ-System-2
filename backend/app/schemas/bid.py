from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BidCreate(BaseModel):
    carrier_name: str = Field(..., min_length=2, max_length=150)
    freight_charges: Decimal = Field(..., ge=Decimal("0.00"), max_digits=12, decimal_places=2)
    origin_charges: Decimal = Field(..., ge=Decimal("0.00"), max_digits=12, decimal_places=2)
    destination_charges: Decimal = Field(..., ge=Decimal("0.00"), max_digits=12, decimal_places=2)
    transit_time: int = Field(..., gt=0, description="Transit time in days")
    validity_date: date


class BidResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rfq_id: UUID
    supplier_id: UUID | None = None
    supplier_label: str
    is_current_user: bool = False
    carrier_name: str
    freight_charges: Decimal
    origin_charges: Decimal
    destination_charges: Decimal
    total_amount: Decimal
    transit_time: int
    validity_date: date
    created_at: datetime


class RankingEntryResponse(BaseModel):
    rank: int
    rank_label: str
    supplier_id: UUID | None = None
    supplier_label: str
    is_current_user: bool = False
    bid_id: UUID
    carrier_name: str
    freight_charges: Decimal
    origin_charges: Decimal
    destination_charges: Decimal
    total_amount: Decimal
    transit_time: int
    validity_date: date
    submitted_at: datetime


class BidSubmissionResultResponse(BaseModel):
    bid: BidResponse
    rankings: list[RankingEntryResponse]
    auction_extended: bool
    extension_reasons: list[str]
    previous_close_time: datetime
    current_close_time: datetime
    forced_close_time: datetime
    server_time: datetime
