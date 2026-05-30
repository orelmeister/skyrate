"""drop unique constraint on applicant_profiles.ben (+applicant_bens.ben)

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-05-30 12:00:00.000000

Demo accounts need to share the same BEN (Replace Identity feature).
Drop UNIQUE, keep a regular index for query speed.
Mirrors the spin fix in k6l7m8n9o0p1.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l7m8n9o0p1q2'
down_revision: Union[str, None] = 'k6l7m8n9o0p1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- applicant_profiles.ben ---
    # The index/constraint name may vary — try common names
    try:
        op.drop_index('ix_applicant_profiles_ben', table_name='applicant_profiles')
    except Exception:
        pass
    try:
        op.drop_constraint('uq_applicant_profiles_ben', 'applicant_profiles', type_='unique')
    except Exception:
        pass
    try:
        op.drop_index('ben', table_name='applicant_profiles')
    except Exception:
        pass
    # Create a regular (non-unique) index
    op.create_index('ix_applicant_profiles_ben', 'applicant_profiles', ['ben'], unique=False)

    # --- applicant_bens.ben ---
    try:
        op.drop_index('ix_applicant_bens_ben', table_name='applicant_bens')
    except Exception:
        pass
    try:
        op.drop_constraint('uq_applicant_bens_ben', 'applicant_bens', type_='unique')
    except Exception:
        pass
    try:
        op.drop_index('ben', table_name='applicant_bens')
    except Exception:
        pass
    # Create a regular (non-unique) index
    op.create_index('ix_applicant_bens_ben', 'applicant_bens', ['ben'], unique=False)


def downgrade() -> None:
    # applicant_profiles
    try:
        op.drop_index('ix_applicant_profiles_ben', table_name='applicant_profiles')
    except Exception:
        pass
    try:
        op.create_index('ix_applicant_profiles_ben', 'applicant_profiles', ['ben'], unique=True)
    except Exception:
        pass

    # applicant_bens
    try:
        op.drop_index('ix_applicant_bens_ben', table_name='applicant_bens')
    except Exception:
        pass
    try:
        op.create_index('ix_applicant_bens_ben', 'applicant_bens', ['ben'], unique=True)
    except Exception:
        pass
