"""add usac_query_cache table

Revision ID: e1f2g3h4i5j6
Revises: d9e4f5g6h7i8
Create Date: 2026-05-11 20:30:00.000000

Cache table for USAC Open Data API responses. Keyed by a SHA-256 hash of
the call namespace + parameters. Used by utils.usac_cache.get_or_cache to
shortcut slow Sodapy/USAC queries (e.g., /vendor/470/leads which was
~50s end-to-end before caching).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2g3h4i5j6'
down_revision: Union[str, None] = 'd9e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'usac_query_cache',
        sa.Column('query_hash', sa.CHAR(length=64), primary_key=True),
        sa.Column('response_json', sa.dialects.mysql.LONGTEXT(), nullable=False),
        sa.Column('cached_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_usac_cache_expires', 'usac_query_cache', ['expires_at'])


def downgrade() -> None:
    op.drop_index('ix_usac_cache_expires', table_name='usac_query_cache')
    op.drop_table('usac_query_cache')
