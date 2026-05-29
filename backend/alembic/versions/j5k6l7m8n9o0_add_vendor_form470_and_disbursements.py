"""add vendor_form470_snapshots and frn_disbursements tables

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-05-29 12:00:00.000000

Phase 1: vendor_form470_snapshots for instant Form 470 leads.
Phase 2: frn_disbursements for BEAR/SPI invoice tracking.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j5k6l7m8n9o0'
down_revision: Union[str, None] = 'i4j5k6l7m8n9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendor_form470_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('application_number', sa.String(length=64), nullable=False),
        sa.Column('funding_year', sa.String(length=16), nullable=True),
        sa.Column('ben', sa.String(length=64), nullable=True),
        sa.Column('entity_name', sa.String(length=512), nullable=True),
        sa.Column('state', sa.String(length=8), nullable=True),
        sa.Column('city', sa.String(length=256), nullable=True),
        sa.Column('applicant_type', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=128), nullable=True),
        sa.Column('posting_date', sa.String(length=64), nullable=True),
        sa.Column('allowable_contract_date', sa.String(length=64), nullable=True),
        sa.Column('contact_name', sa.String(length=256), nullable=True),
        sa.Column('contact_email', sa.String(length=256), nullable=True),
        sa.Column('contact_phone', sa.String(length=64), nullable=True),
        sa.Column('technical_contact', sa.String(length=256), nullable=True),
        sa.Column('technical_email', sa.String(length=256), nullable=True),
        sa.Column('technical_phone', sa.String(length=64), nullable=True),
        sa.Column('cat1_description', sa.Text(), nullable=True),
        sa.Column('cat2_description', sa.Text(), nullable=True),
        sa.Column('services_json', sa.Text(), nullable=True),
        sa.Column('manufacturers_json', sa.Text(), nullable=True),
        sa.Column('service_types_json', sa.Text(), nullable=True),
        sa.Column('categories_json', sa.Text(), nullable=True),
        sa.Column('c2_budget_total', sa.Float(), nullable=True),
        sa.Column('c2_budget_available', sa.Float(), nullable=True),
        sa.Column('c2_budget_cycle', sa.String(length=32), nullable=True),
        sa.Column('last_refreshed', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_v470_snap_app_num', 'vendor_form470_snapshots', ['application_number'])
    op.create_index('ix_v470_snap_ben', 'vendor_form470_snapshots', ['ben'])
    op.create_index('ix_v470_snap_state', 'vendor_form470_snapshots', ['state'])
    op.create_index('ix_v470_snap_year_state', 'vendor_form470_snapshots', ['funding_year', 'state'])
    op.create_index('ix_v470_snap_posting', 'vendor_form470_snapshots', ['posting_date'])

    op.create_table(
        'frn_disbursements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('frn', sa.String(length=64), nullable=False),
        sa.Column('funding_year', sa.String(length=16), nullable=True),
        sa.Column('total_authorized_disbursement', sa.Float(), nullable=True, default=0),
        sa.Column('last_invoice_date', sa.Date(), nullable=True),
        sa.Column('invoicing_mode', sa.String(length=8), nullable=True),
        sa.Column('disbursement_count', sa.Integer(), nullable=True, default=0),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_frn_disb_frn', 'frn_disbursements', ['frn'])
    op.create_index('ix_frn_disb_frn_year', 'frn_disbursements', ['frn', 'funding_year'], unique=True)


def downgrade() -> None:
    op.drop_table('frn_disbursements')
    op.drop_table('vendor_form470_snapshots')
