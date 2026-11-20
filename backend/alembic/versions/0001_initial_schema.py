"""Initial schema for GoComet British Auction RFQ System.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('BUYER', 'SUPPLIER')", name="ck_users_role"),
    )
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "rfqs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("buyer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("reference_id", sa.String(64), nullable=False, unique=True),
        sa.Column("bid_start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("initial_bid_close_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bid_close_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("forced_close_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pickup_date", sa.Date(), nullable=False),
        sa.Column("origin", sa.String(150), nullable=False),
        sa.Column("destination", sa.String(150), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="UPCOMING"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('UPCOMING', 'ACTIVE', 'CLOSED', 'FORCE_CLOSED')", name="ck_rfqs_status"),
        sa.CheckConstraint("bid_start_time < initial_bid_close_time", name="ck_rfqs_start_before_initial_close"),
        sa.CheckConstraint("initial_bid_close_time < forced_close_time", name="ck_rfqs_initial_before_forced_close"),
        sa.CheckConstraint("bid_close_time <= forced_close_time", name="ck_rfqs_close_lte_forced_close"),
    )
    op.create_index("ix_rfqs_buyer_status", "rfqs", ["buyer_id", "status"])
    op.create_index("ix_rfqs_status_close_time", "rfqs", ["status", "bid_close_time"])

    op.create_table(
        "rfq_suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("invitation_status", sa.String(20), nullable=False, server_default="INVITED"),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("rfq_id", "supplier_id", name="uq_rfq_suppliers_rfq_supplier"),
        sa.CheckConstraint("invitation_status IN ('INVITED', 'ACCEPTED', 'DECLINED')", name="ck_rfq_suppliers_status"),
    )
    op.create_index("ix_rfq_suppliers_supplier", "rfq_suppliers", ["supplier_id"])

    op.create_table(
        "auction_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("trigger_window_minutes", sa.Integer(), nullable=False),
        sa.Column("extension_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("bid_received_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("any_rank_change_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("l1_rank_change_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.CheckConstraint("trigger_window_minutes > 0", name="ck_auction_configs_trigger_pos"),
        sa.CheckConstraint("extension_duration_minutes > 0", name="ck_auction_configs_ext_pos"),
    )

    op.create_table(
        "bids",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("carrier_name", sa.String(150), nullable=False),
        sa.Column("freight_charges", sa.Numeric(12, 2), nullable=False),
        sa.Column("origin_charges", sa.Numeric(12, 2), nullable=False),
        sa.Column("destination_charges", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("transit_time", sa.Integer(), nullable=False),
        sa.Column("validity_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("freight_charges >= 0", name="ck_bids_freight_non_neg"),
        sa.CheckConstraint("origin_charges >= 0", name="ck_bids_origin_non_neg"),
        sa.CheckConstraint("destination_charges >= 0", name="ck_bids_dest_non_neg"),
        sa.CheckConstraint("total_amount >= 0", name="ck_bids_total_non_neg"),
        sa.CheckConstraint("transit_time > 0", name="ck_bids_transit_pos"),
    )
    op.create_index("ix_bids_rfq_supplier_created", "bids", ["rfq_id", "supplier_id", "created_at"])
    op.create_index("ix_bids_rfq_created", "bids", ["rfq_id", "created_at"])

    op.create_table(
        "auction_activity_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bid_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bids.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_activity_rfq_created", "auction_activity_logs", ["rfq_id", "created_at"])


def downgrade() -> None:
    op.drop_table("auction_activity_logs")
    op.drop_table("bids")
    op.drop_table("auction_configs")
    op.drop_table("rfq_suppliers")
    op.drop_table("rfqs")
    op.drop_table("users")
