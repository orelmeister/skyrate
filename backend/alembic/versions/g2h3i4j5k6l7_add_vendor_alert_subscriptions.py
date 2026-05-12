"""add vendor alert subscription tables

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-12 21:00:00.000000

Phase 1 of the Vendor Portal Parity Plan v2: introduce the data model
required for vendor-side Form 470 alert subscriptions plus the supporting
match/scan/push/in-app tables. UI, scanner, and dispatcher land in later
phases (P2-P7); this migration only stands up the schema and is safe to
apply ahead of time (no existing rows are touched).

Tables added:
  1. vendor_alert_subscriptions    - one row per saved alert (filter or watchlist)
  2. vendor_alert_matches          - one row per (subscription, Form 470) hit
  3. vendor_alert_scan_runs        - scanner run log (P2 will populate)
  4. vendor_push_subscriptions     - Web Push endpoints scoped to vendor profile
  5. vendor_in_app_notifications   - notification bell entries for the vendor UI
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g2h3i4j5k6l7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendor_alert_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('vendor_profile_id', sa.Integer(), sa.ForeignKey('vendor_profiles.id'), nullable=False, index=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('mode', sa.Enum('filter', 'watchlist', name='vendor_alert_mode'), nullable=False, server_default='filter'),
        sa.Column('states', sa.JSON(), nullable=True),
        sa.Column('service_categories', sa.JSON(), nullable=True),
        sa.Column('applicant_types', sa.JSON(), nullable=True),
        sa.Column('min_amount', sa.DECIMAL(precision=12, scale=2), nullable=True),
        sa.Column('max_amount', sa.DECIMAL(precision=12, scale=2), nullable=True),
        sa.Column('watchlist_bens', sa.JSON(), nullable=True),
        sa.Column('channels', sa.JSON(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone_e164', sa.String(length=20), nullable=True),
        sa.Column('is_paid_tier', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('last_dispatched_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )

    op.create_table(
        'vendor_alert_matches',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('subscription_id', sa.Integer(), sa.ForeignKey('vendor_alert_subscriptions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('form_470_application_number', sa.String(length=64), nullable=False),
        sa.Column('ben', sa.String(length=20), nullable=True),
        sa.Column('matched_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('delivered_email_at', sa.DateTime(), nullable=True),
        sa.Column('delivered_sms_at', sa.DateTime(), nullable=True),
        sa.Column('delivered_push_at', sa.DateTime(), nullable=True),
        sa.Column('read_in_app_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('subscription_id', 'form_470_application_number', name='uq_vendor_alert_match_sub_form'),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_vendor_alert_matches_matched_at', 'vendor_alert_matches', ['matched_at'])

    op.create_table(
        'vendor_alert_scan_runs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('rows_pulled', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('matches_created', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('error', sa.Text(), nullable=True),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )

    op.create_table(
        'vendor_push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('vendor_profile_id', sa.Integer(), sa.ForeignKey('vendor_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('ua', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_vendor_push_subscriptions_vendor_profile_id', 'vendor_push_subscriptions', ['vendor_profile_id'])

    op.create_table(
        'vendor_in_app_notifications',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('vendor_profile_id', sa.Integer(), sa.ForeignKey('vendor_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('subscription_id', sa.Integer(), sa.ForeignKey('vendor_alert_subscriptions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('link', sa.String(length=500), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_vendor_in_app_notif_profile_read', 'vendor_in_app_notifications', ['vendor_profile_id', 'read_at'])


def downgrade() -> None:
    op.drop_index('ix_vendor_in_app_notif_profile_read', table_name='vendor_in_app_notifications')
    op.drop_table('vendor_in_app_notifications')

    op.drop_index('ix_vendor_push_subscriptions_vendor_profile_id', table_name='vendor_push_subscriptions')
    op.drop_table('vendor_push_subscriptions')

    op.drop_table('vendor_alert_scan_runs')

    op.drop_index('ix_vendor_alert_matches_matched_at', table_name='vendor_alert_matches')
    op.drop_table('vendor_alert_matches')

    op.drop_table('vendor_alert_subscriptions')
    # Drop the enum type explicitly for backends that need it (Postgres);
    # on MySQL the enum lives inline with the column and is dropped with the
    # table.
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        sa.Enum(name='vendor_alert_mode').drop(bind, checkfirst=True)
