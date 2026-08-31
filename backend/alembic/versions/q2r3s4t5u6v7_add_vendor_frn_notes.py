"""Add vendor_frn_notes table (B8)

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-08-31 00:00:00.000000

B8 vendor-portal feature: a lightweight per-FRN free-form manual note a vendor
keeps in the FRN Status view. One row per (vendor_profile_id, frn), separate
from the richer vendor_frn_tracking annotations.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'q2r3s4t5u6v7'
down_revision = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'vendor_frn_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_profile_id', sa.Integer(), nullable=False),
        sa.Column('frn', sa.String(length=50), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vendor_profile_id', 'frn', name='uq_vendor_frn_notes_profile_frn'),
    )
    op.create_index('ix_vendor_frn_notes_id', 'vendor_frn_notes', ['id'], unique=False)
    op.create_index('ix_vendor_frn_notes_vendor_profile_id', 'vendor_frn_notes', ['vendor_profile_id'], unique=False)
    op.create_index('ix_vendor_frn_notes_frn', 'vendor_frn_notes', ['frn'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_vendor_frn_notes_frn', table_name='vendor_frn_notes')
    op.drop_index('ix_vendor_frn_notes_vendor_profile_id', table_name='vendor_frn_notes')
    op.drop_index('ix_vendor_frn_notes_id', table_name='vendor_frn_notes')
    op.drop_table('vendor_frn_notes')
