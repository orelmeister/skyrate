"""add spin and contract_number to admin_frn_snapshots

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-06-07 12:00:00.000000

Adds spin (Service Provider Identification Number) and contract_number
columns to admin_frn_snapshots to support SPIN/CRN search filtering
on the Portfolio FRN Status page.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e0f1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('admin_frn_snapshots', sa.Column('spin', sa.String(64), nullable=True))
    op.add_column('admin_frn_snapshots', sa.Column('contract_number', sa.String(128), nullable=True))
    op.create_index('ix_admin_frn_snap_spin', 'admin_frn_snapshots', ['spin'])
    op.create_index('ix_admin_frn_snap_contract', 'admin_frn_snapshots', ['contract_number'])


def downgrade() -> None:
    op.drop_index('ix_admin_frn_snap_contract', table_name='admin_frn_snapshots')
    op.drop_index('ix_admin_frn_snap_spin', table_name='admin_frn_snapshots')
    op.drop_column('admin_frn_snapshots', 'contract_number')
    op.drop_column('admin_frn_snapshots', 'spin')
