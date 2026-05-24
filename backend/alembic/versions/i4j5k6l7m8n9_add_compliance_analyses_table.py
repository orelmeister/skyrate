"""add compliance_analyses table

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-05-24 12:00:00.000000

Universal compliance analysis audit history table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i4j5k6l7m8n9'
down_revision: Union[str, None] = 'h3i4j5k6l7m8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'compliance_analyses',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('form_type', sa.String(length=16), nullable=False),
        sa.Column('form_number', sa.String(length=64), nullable=True),
        sa.Column('primary_filename', sa.String(length=255), nullable=False),
        sa.Column('supporting_filenames', sa.JSON(), nullable=True),
        sa.Column('overall_risk', sa.String(length=16), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('result_json', sa.JSON(), nullable=True),
        sa.Column('engine_version', sa.String(length=32), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('prior_analysis_id', sa.Integer(), sa.ForeignKey('compliance_analyses.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
    )
    op.create_index('ix_compliance_analyses_user_id', 'compliance_analyses', ['user_id'])
    op.create_index('ix_compliance_analyses_form_type', 'compliance_analyses', ['form_type'])
    op.create_index('ix_compliance_analyses_form_number', 'compliance_analyses', ['form_number'])
    op.create_index('ix_compliance_analyses_created_at', 'compliance_analyses', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_compliance_analyses_created_at', table_name='compliance_analyses')
    op.drop_index('ix_compliance_analyses_form_number', table_name='compliance_analyses')
    op.drop_index('ix_compliance_analyses_form_type', table_name='compliance_analyses')
    op.drop_index('ix_compliance_analyses_user_id', table_name='compliance_analyses')
    op.drop_table('compliance_analyses')
