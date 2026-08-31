"""Add vendor_470_digest_subscriptions table

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-08-31 00:00:00.000000

Vendor daily Form 470 email digest: each row is a vendor's saved Form 470 Lead
search (year/state/category/service_type/manufacturer/name). A daily scheduler
job re-runs each enabled subscription and emails the NEW 470 postings since the
last dispatch.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'r3s4t5u6v7w8'
down_revision = 'q2r3s4t5u6v7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'vendor_470_digest_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_profile_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('filters_json', sa.JSON(), nullable=True),
        sa.Column('frequency', sa.String(length=20), nullable=False, server_default='daily'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('last_sent_at', sa.DateTime(), nullable=True),
        sa.Column('last_seen_marker', sa.String(length=40), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['vendor_profile_id'], ['vendor_profiles.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vendor_470_digest_subscriptions_id', 'vendor_470_digest_subscriptions', ['id'], unique=False)
    op.create_index('ix_vendor_470_digest_subscriptions_vendor_profile_id', 'vendor_470_digest_subscriptions', ['vendor_profile_id'], unique=False)
    op.create_index('ix_v470_digest_enabled', 'vendor_470_digest_subscriptions', ['enabled'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_v470_digest_enabled', table_name='vendor_470_digest_subscriptions')
    op.drop_index('ix_vendor_470_digest_subscriptions_vendor_profile_id', table_name='vendor_470_digest_subscriptions')
    op.drop_index('ix_vendor_470_digest_subscriptions_id', table_name='vendor_470_digest_subscriptions')
    op.drop_table('vendor_470_digest_subscriptions')
