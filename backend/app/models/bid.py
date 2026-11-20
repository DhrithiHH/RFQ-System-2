import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (
        CheckConstraint("freight_charges >= 0", name="ck_bids_freight_non_neg"),
        CheckConstraint("origin_charges >= 0", name="ck_bids_origin_non_neg"),
        CheckConstraint("destination_charges >= 0", name="ck_bids_dest_non_neg"),
        CheckConstraint("total_amount >= 0", name="ck_bids_total_non_neg"),
        CheckConstraint("transit_time > 0", name="ck_bids_transit_pos"),
        Index("ix_bids_rfq_supplier_created", "rfq_id", "supplier_id", "created_at"),
        Index("ix_bids_rfq_created", "rfq_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rfq_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    carrier_name: Mapped[str] = mapped_column(String(150), nullable=False)
    freight_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    origin_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    destination_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    transit_time: Mapped[int] = mapped_column(Integer, nullable=False)
    validity_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    rfq = relationship("RFQ", back_populates="bids")
    supplier = relationship("User", back_populates="bids")
    activity_logs = relationship("AuctionActivityLog", back_populates="bid")
