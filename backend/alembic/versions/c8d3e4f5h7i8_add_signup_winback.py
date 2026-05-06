"""add users.pending_identifier_reminder + email_verification_tokens table

Revision ID: c8d3e4f5h7i8
Revises: b7c2d3e4f5g6
Create Date: 2026-05-06 20:00:00.000000

Adds:
- users.pending_identifier_reminder DATETIME nullable — set when user clicks "remind me later"
  during onboarding step 0. A scheduled job sends a follow-up email ~48h after this stamp.
- email_verification_tokens table — single-use HMAC-signed tokens for magic-link flows
  (winback campaign, future passwordless reactivation). One row per token; row's
  used_at is stamped when redeemed so re-use is impossible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8d3e4f5h7i8'
down_revision: Union[str, None] = 'b7c2d3e4f5g6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) New nullable column on users — when set, reminder email queued for ~48h later.
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('pending_identifier_reminder', sa.DateTime(), nullable=True))

    # 2) Single-use magic-link token table.
    # purpose values: 'winback' (re-engage stranded signups), 'magic_login'
    # (future passwordless), 'identifier_reminder' (one-click re-onboard).
    op.create_table(
        'email_verification_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('purpose', sa.String(length=32), nullable=False, server_default='magic_login'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_email_verification_tokens_token_hash',
        'email_verification_tokens',
        ['token_hash'],
        unique=True,
    )
    op.create_index(
        'ix_email_verification_tokens_user_id',
        'email_verification_tokens',
        ['user_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_email_verification_tokens_user_id', table_name='email_verification_tokens')
    op.drop_index('ix_email_verification_tokens_token_hash', table_name='email_verification_tokens')
    op.drop_table('email_verification_tokens')
    with op.batch_alter_table('users') as batch:
        batch.drop_column('pending_identifier_reminder')
