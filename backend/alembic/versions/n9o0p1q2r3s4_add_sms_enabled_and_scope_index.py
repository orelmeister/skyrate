"""Add sms_enabled to alert_configs and scope index to frn_status_changes_queue

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-05-31 12:00:00.000000

Adds sms_enabled gate column to alert_configs for SMS-on-denial (Commit 5),
and a composite index on (scope_type, scope_value, processed_at) for efficient
digest queries.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'n9o0p1q2r3s4'
down_revision = 'm8n9o0p1q2r3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- alert_configs: add sms_enabled gate ---
    op.add_column('alert_configs', sa.Column('sms_enabled', sa.Boolean(), nullable=False, server_default=sa.text('0')))

    # --- frn_status_changes_queue: composite index for digest queries ---
    op.create_index(
        'ix_frn_status_changes_queue_scope',
        'frn_status_changes_queue',
        ['scope_type', 'scope_value', 'processed_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_frn_status_changes_queue_scope', table_name='frn_status_changes_queue')
    op.drop_column('alert_configs', 'sms_enabled')
