"""add form470_postings table

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-05-12 23:30:00.000000

Phase 2 of the Vendor Portal Parity Plan v2: persist Form 470 postings
pulled from USAC opendata (dataset jt8s-3q52) so the matcher can fire
vendor alert subscriptions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h3i4j5k6l7m8'
down_revision: Union[str, None] = 'g2h3i4j5k6l7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'form470_postings',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('application_number', sa.String(length=64), nullable=False),
        sa.Column('ben', sa.String(length=20), nullable=True),
        sa.Column('applicant_name', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=2), nullable=True),
        sa.Column('certified_date', sa.DateTime(), nullable=True),
        sa.Column('allowable_contract_date', sa.DateTime(), nullable=True),
        sa.Column('total_pre_discount_cost', sa.DECIMAL(precision=14, scale=2), nullable=True),
        sa.Column('service_categories', sa.JSON(), nullable=True),
        sa.Column('service_types', sa.JSON(), nullable=True),
        sa.Column('applicant_type', sa.String(length=50), nullable=True),
        sa.Column('rfp_url', sa.String(length=500), nullable=True),
        sa.Column('raw', sa.JSON(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('application_number', name='uq_form470_postings_application_number'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_form470_postings_ben', 'form470_postings', ['ben'])
    op.create_index('ix_form470_postings_state', 'form470_postings', ['state'])
    op.create_index('ix_form470_postings_certified_date', 'form470_postings', ['certified_date'])


def downgrade() -> None:
    op.drop_index('ix_form470_postings_certified_date', table_name='form470_postings')
    op.drop_index('ix_form470_postings_state', table_name='form470_postings')
    op.drop_index('ix_form470_postings_ben', table_name='form470_postings')
    op.drop_table('form470_postings')
