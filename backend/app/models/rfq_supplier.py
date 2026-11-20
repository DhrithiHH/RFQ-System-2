import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now


class InvitationStatus(str, enum.Enum):
    INVITED = "INVITED"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"


class RFQSupplier(Base):
    __tablename__ = "rfq_suppliers"
    __table_args__ = (
        UniqueConstraint("rfq_id", "supplier_id", name="uq_rfq_suppliers_rfq_supplier"),
        CheckConstraint(
            "invitation_status IN ('INVITED', 'ACCEPTED', 'DECLINED')",
            name="ck_rfq_suppliers_status",
        ),
        Index("ix_rfq_suppliers_supplier", "supplier_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rfq_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    invitation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=InvitationStatus.INVITED.value
    )
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    rfq = relationship("RFQ", back_populates="invited_suppliers")
    supplier = relationship("User", back_populates="invitations")
