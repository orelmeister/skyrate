"""initial_schema

Revision ID: 4ba0b7042e18
Revises: 
Create Date: 2026-02-05 06:12:32.662267

This is the baseline migration representing the initial schema.
All 19 tables were created using Base.metadata.create_all() before
Alembic was set up. This migration is empty but marks the starting
point for all future migrations.

Tables in initial schema:
- users, subscriptions
- consultant_profiles, consultant_schools
- vendor_profiles, vendor_searches, saved_leads
- organization_enrichment_cache
- school_snapshots, applications, appeal_records
- query_history, alert_configs, alerts
- applicant_profiles, applicant_bens, applicant_frns
- applicant_auto_appeals, applicant_status_history
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ba0b7042e18'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Initial schema - tables already exist in database
    # This migration marks the baseline for future changes
    pass


def downgrade() -> None:
    # Cannot downgrade initial schema - would require dropping all tables
    pass
