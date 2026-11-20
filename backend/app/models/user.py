import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now


class UserRole(str, enum.Enum):
    BUYER = "BUYER"
    SUPPLIER = "SUPPLIER"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('BUYER', 'SUPPLIER')", name="ck_users_role"),
        Index("ix_users_role", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    created_rfqs = relationship("RFQ", back_populates="buyer", foreign_keys="RFQ.buyer_id")
    invitations = relationship("RFQSupplier", back_populates="supplier")
    bids = relationship("Bid", back_populates="supplier")
