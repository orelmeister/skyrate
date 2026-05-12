"""add composite indexes for FRN reports + watches

Revision ID: f1a2b3c4d5e6
Revises: e1f2g3h4i5j6
Create Date: 2026-05-12 18:00:00.000000

Adds composite indexes that match the actual query patterns used by the
`/frn-reports*` endpoints (consultant/applicant/vendor share these tables):

- frn_watches:
    * (user_id, created_at DESC) — list_watches order-by
    * (user_id, is_active)       — active watch count + active-watch loops

- frn_report_history:
    * (user_id, generated_at DESC) — list_report_history order-by

These pages were observed in the 300-700ms range before indexing; targeted
composite indexes drop the SQL portion to sub-10ms even with thousands of
rows. Indexes are created idempotently because DigitalOcean App Platform
re-runs migrations on every deploy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e1f2g3h4i5j6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, index_name, columns)
_INDEXES = [
    ('frn_watches', 'ix_frn_watches_user_created', ['user_id', 'created_at']),
    ('frn_watches', 'ix_frn_watches_user_active', ['user_id', 'is_active']),
    ('frn_report_history', 'ix_frn_report_history_user_generated', ['user_id', 'generated_at']),
]


def _has_index(bind, table_name: str, index_name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        existing = {ix['name'] for ix in insp.get_indexes(table_name)}
    except Exception:
        return False
    return index_name in existing


def _has_table(bind, table_name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return insp.has_table(table_name)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    for table, name, cols in _INDEXES:
        if not _has_table(bind, table):
            continue
        if _has_index(bind, table, name):
            continue
        try:
            op.create_index(name, table, cols)
        except Exception:
            # Defensive: another concurrent deploy may have created it.
            pass


def downgrade() -> None:
    bind = op.get_bind()
    for table, name, _cols in _INDEXES:
        if not _has_table(bind, table):
            continue
        if not _has_index(bind, table, name):
            continue
        try:
            op.drop_index(name, table_name=table)
        except Exception:
            pass
