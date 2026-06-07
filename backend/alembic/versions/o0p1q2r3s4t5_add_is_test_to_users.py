"""Add is_test column to users table

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-06-07 22:00:00.000000

Flags test accounts (email ends in @example.com or starts with test_) so digest
jobs can skip real SMTP for them.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'o0p1q2r3s4t5'
down_revision = 'n9o0p1q2r3s4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_test', sa.Boolean(), nullable=False, server_default='0'))

    # Backfill: flag existing test accounts
    op.execute("""
        UPDATE users SET is_test = 1
        WHERE email LIKE 'test\\_%@%' OR email LIKE '%@example.com'
    """)


def downgrade() -> None:
    op.drop_column('users', 'is_test')
