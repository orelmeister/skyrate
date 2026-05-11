"""make applicant_profiles.ben nullable for deferred onboarding

Revision ID: d9e4f5g6h7i8
Revises: c8d3e4f5h7i8
Create Date: 2026-05-11 15:00:00.000000

Sign-up flow collects only email + password. BEN is optional at registration
and collected during the onboarding step. This migration allows NULL in the
ben column so applicant accounts can be created before BEN is verified.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e4f5g6h7i8'
down_revision: Union[str, None] = 'c8d3e4f5h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('applicant_profiles') as batch:
        batch.alter_column(
            'ben',
            existing_type=sa.String(length=50),
            nullable=True,
        )


def downgrade() -> None:
    # NOTE: Downgrade will fail if any rows have ben = NULL.
    # Ensure all rows have a ben value before downgrading.
    with op.batch_alter_table('applicant_profiles') as batch:
        batch.alter_column(
            'ben',
            existing_type=sa.String(length=50),
            nullable=False,
        )
