"""Add FRN digest columns to queue + alert_configs

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-06-01 00:00:00.000000

Adds enrichment columns to frn_status_changes_queue for digest rendering,
adds last_frn_digest_at to alert_configs for dedup,
and retro-enables daily_digest for existing consultant/vendor users.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'm8n9o0p1q2r3'
down_revision = 'l7m8n9o0p1q2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- frn_status_changes_queue: add enrichment columns ---
    op.add_column('frn_status_changes_queue', sa.Column('ben', sa.String(64), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('scope_type', sa.String(16), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('scope_value', sa.String(128), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('old_amount', sa.Float(), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('new_amount', sa.Float(), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('entity_name', sa.String(512), nullable=True))
    op.add_column('frn_status_changes_queue', sa.Column('processed_at', sa.DateTime(), nullable=True))
    op.create_index('ix_frn_status_changes_queue_ben', 'frn_status_changes_queue', ['ben'])

    # --- alert_configs: add digest tracking ---
    op.add_column('alert_configs', sa.Column('last_frn_digest_at', sa.DateTime(), nullable=True))

    # --- Retro-enable daily_digest for existing consultant/vendor users ---
    # Uses raw SQL to join users table and update alert_configs
    op.execute("""
        UPDATE alert_configs ac
        INNER JOIN users u ON ac.user_id = u.id
        SET ac.daily_digest = 1
        WHERE u.role IN ('consultant', 'vendor')
          AND ac.daily_digest = 0
    """)


def downgrade() -> None:
    op.drop_index('ix_frn_status_changes_queue_ben', table_name='frn_status_changes_queue')
    op.drop_column('frn_status_changes_queue', 'processed_at')
    op.drop_column('frn_status_changes_queue', 'entity_name')
    op.drop_column('frn_status_changes_queue', 'new_amount')
    op.drop_column('frn_status_changes_queue', 'old_amount')
    op.drop_column('frn_status_changes_queue', 'scope_value')
    op.drop_column('frn_status_changes_queue', 'scope_type')
    op.drop_column('frn_status_changes_queue', 'ben')
    op.drop_column('alert_configs', 'last_frn_digest_at')

    # Note: downgrade does NOT revert the daily_digest=1 update (data-only change)
