import enum
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now


class RFQStatus(str, enum.Enum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    FORCE_CLOSED = "FORCE_CLOSED"


class RFQ(Base):
    __tablename__ = "rfqs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('UPCOMING', 'ACTIVE', 'CLOSED', 'FORCE_CLOSED')",
            name="ck_rfqs_status",
        ),
        CheckConstraint("bid_start_time < initial_bid_close_time", name="ck_rfqs_start_before_initial_close"),
        CheckConstraint("initial_bid_close_time < forced_close_time", name="ck_rfqs_initial_before_forced_close"),
        CheckConstraint("bid_close_time <= forced_close_time", name="ck_rfqs_close_lte_forced_close"),
        Index("ix_rfqs_buyer_status", "buyer_id", "status"),
        Index("ix_rfqs_status_close_time", "status", "bid_close_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    bid_start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    initial_bid_close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    bid_close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    forced_close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False)
    origin: Mapped[str] = mapped_column(String(150), nullable=False)
    destination: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RFQStatus.UPCOMING.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    buyer = relationship("User", back_populates="created_rfqs", foreign_keys=[buyer_id])
    auction_config = relationship("AuctionConfig", back_populates="rfq", uselist=False, cascade="all, delete-orphan")
    invited_suppliers = relationship("RFQSupplier", back_populates="rfq", cascade="all, delete-orphan")
    bids = relationship("Bid", back_populates="rfq", cascade="all, delete-orphan")
    activity_logs = relationship("AuctionActivityLog", back_populates="rfq", cascade="all, delete-orphan")
