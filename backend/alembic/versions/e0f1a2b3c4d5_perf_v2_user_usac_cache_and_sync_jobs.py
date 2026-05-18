"""perf_v2: user_usac_cache + usac_sync_jobs (additive only)

Revision ID: e0f1a2b3c4d5
Revises: d9e4f5g6h7i8
Create Date: 2026-05-18 09:30:00.000000

Adds two new tables to support the perf_v2 single-shot performance overhaul.

This migration is CREATE-only — it does NOT modify any existing tables. Both
new tables are gated by the PERF_V2_ENABLED feature flag at runtime, so
applying this migration is safe even before the flag is flipped on.

Tables:
  - user_usac_cache: one row per user holding the latest USAC-derived
    payloads (schools, dashboard stats, CRNs) pre-hydrated for instant
    cache-first reads.
  - usac_sync_jobs: log of every hydration job (manual sync, signup hook,
    nightly refresh). Used by /v1/sync-usac/{job_id} polling and the
    /admin/perf-summary observability endpoint.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e0f1a2b3c4d5'
down_revision: Union[str, None] = 'd9e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # user_usac_cache: per-user pre-hydrated USAC payloads
    op.create_table(
        'user_usac_cache',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('schools_json', sa.Text(), nullable=True),
        sa.Column('dashboard_stats_json', sa.Text(), nullable=True),
        sa.Column('crns_json', sa.Text(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('fresh', 'stale', 'syncing', 'error', name='usac_cache_status'),
            nullable=False,
            server_default='stale',
        ),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_user_usac_cache_user_id'),
    )
    op.create_index(
        'ix_user_usac_cache_last_synced_at',
        'user_usac_cache',
        ['last_synced_at'],
    )

    # usac_sync_jobs: log of every hydration attempt
    op.create_table(
        'usac_sync_jobs',
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column(
            'trigger',
            sa.Enum(
                'signup', 'login', 'manual', 'nightly', 'backfill',
                name='usac_sync_trigger',
            ),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum(
                'pending', 'running', 'succeeded', 'failed',
                name='usac_sync_job_status',
            ),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('job_id'),
    )
    op.create_index('ix_usac_sync_jobs_user_id', 'usac_sync_jobs', ['user_id'])
    op.create_index('ix_usac_sync_jobs_status', 'usac_sync_jobs', ['status'])
    op.create_index('ix_usac_sync_jobs_created_at', 'usac_sync_jobs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_usac_sync_jobs_created_at', table_name='usac_sync_jobs')
    op.drop_index('ix_usac_sync_jobs_status', table_name='usac_sync_jobs')
    op.drop_index('ix_usac_sync_jobs_user_id', table_name='usac_sync_jobs')
    op.drop_table('usac_sync_jobs')

    op.drop_index('ix_user_usac_cache_last_synced_at', table_name='user_usac_cache')
    op.drop_table('user_usac_cache')

    # Drop the Enum types last (MySQL ignores; PG cleanup)
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        sa.Enum(name='usac_sync_job_status').drop(bind, checkfirst=True)
        sa.Enum(name='usac_sync_trigger').drop(bind, checkfirst=True)
        sa.Enum(name='usac_cache_status').drop(bind, checkfirst=True)
