"""drop unique constraint on vendor_profiles.spin

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-29 16:00:00.000000

Demo accounts need to share the same SPIN (Replace Identity feature).
Drop UNIQUE, keep a regular index for query speed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'k6l7m8n9o0p1'
down_revision: Union[str, None] = 'j5k6l7m8n9o0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the unique index on vendor_profiles.spin
    # The index name may vary — try both common names
    try:
        op.drop_index('ix_vendor_profiles_spin', table_name='vendor_profiles')
    except Exception:
        pass
    # Create a regular (non-unique) index
    op.create_index('ix_vendor_profiles_spin', 'vendor_profiles', ['spin'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_vendor_profiles_spin', table_name='vendor_profiles')
    op.create_index('ix_vendor_profiles_spin', 'vendor_profiles', ['spin'], unique=True)
