"""Add account_seats table and seat_limit to subscriptions

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-06-23 00:00:00.000000

Phase 4 seats feature: introduces the account_seats table tracking team seats
under a consultant profile, and adds a seat_limit capacity column to the
existing subscriptions table.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'p1q2r3s4t5u6'
down_revision = 'o0p1q2r3s4t5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'account_seats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('consultant_profile_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('invited_email', sa.String(length=255), nullable=False),
        sa.Column('seat_role', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('invite_token', sa.String(length=255), nullable=True),
        sa.Column('invite_expires_at', sa.DateTime(), nullable=True),
        sa.Column('invited_by_admin_id', sa.Integer(), nullable=True),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['consultant_profile_id'], ['consultant_profiles.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['invited_by_admin_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invite_token'),
    )
    op.create_index('ix_account_seats_id', 'account_seats', ['id'], unique=False)
    op.create_index('ix_account_seats_consultant_profile_id', 'account_seats', ['consultant_profile_id'], unique=False)
    op.create_index('ix_account_seats_user_id', 'account_seats', ['user_id'], unique=False)
    op.create_index('ix_account_seats_invited_email', 'account_seats', ['invited_email'], unique=False)
    op.create_index('ix_account_seats_status', 'account_seats', ['status'], unique=False)
    op.create_index('ix_account_seats_invite_token', 'account_seats', ['invite_token'], unique=True)

    op.add_column('subscriptions', sa.Column('seat_limit', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('subscriptions', 'seat_limit')

    op.drop_index('ix_account_seats_invite_token', table_name='account_seats')
    op.drop_index('ix_account_seats_status', table_name='account_seats')
    op.drop_index('ix_account_seats_invited_email', table_name='account_seats')
    op.drop_index('ix_account_seats_user_id', table_name='account_seats')
    op.drop_index('ix_account_seats_consultant_profile_id', table_name='account_seats')
    op.drop_index('ix_account_seats_id', table_name='account_seats')
    op.drop_table('account_seats')
