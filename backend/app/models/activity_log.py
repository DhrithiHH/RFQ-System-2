import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now


class ActivityEventType(str, enum.Enum):
    BID_SUBMITTED = "BID_SUBMITTED"
    RANK_CHANGED = "RANK_CHANGED"
    AUCTION_EXTENDED = "AUCTION_EXTENDED"
    AUCTION_CLOSED = "AUCTION_CLOSED"
    AUCTION_FORCE_CLOSED = "AUCTION_FORCE_CLOSED"


JsonPayloadType = JSON().with_variant(JSONB(), "postgresql")


class AuctionActivityLog(Base):
    __tablename__ = "auction_activity_logs"
    __table_args__ = (Index("ix_activity_rfq_created", "rfq_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rfq_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False
    )
    bid_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("bids.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[dict[str, Any] | None] = mapped_column(JsonPayloadType, nullable=True)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(JsonPayloadType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    rfq = relationship("RFQ", back_populates="activity_logs")
    bid = relationship("Bid", back_populates="activity_logs")
