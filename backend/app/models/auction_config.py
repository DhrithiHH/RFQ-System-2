import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuctionConfig(Base):
    __tablename__ = "auction_configs"
    __table_args__ = (
        CheckConstraint("trigger_window_minutes > 0", name="ck_auction_configs_trigger_pos"),
        CheckConstraint("extension_duration_minutes > 0", name="ck_auction_configs_ext_pos"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rfq_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    trigger_window_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    extension_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    bid_received_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    any_rank_change_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    l1_rank_change_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    rfq = relationship("RFQ", back_populates="auction_config")
