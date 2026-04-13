"""add pia_responses table

Revision ID: a1b2c3d4e5f6
Revises: 4ba0b7042e18
Create Date: 2026-04-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '4ba0b7042e18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pia_responses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ben', sa.String(length=20), nullable=True),
        sa.Column('frn', sa.String(length=20), nullable=True),
        sa.Column('funding_year', sa.Integer(), nullable=True),
        sa.Column('application_number', sa.String(length=50), nullable=True),
        sa.Column('organization_name', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=2), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        sa.Column('pia_category', sa.String(length=50), nullable=False),
        sa.Column('original_question', sa.Text(), nullable=False),
        sa.Column('response_text', sa.Text(), nullable=True),
        sa.Column('supporting_docs', sa.JSON(), nullable=True),
        sa.Column('strategy', sa.JSON(), nullable=True),
        sa.Column('chat_history', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('deadline_date', sa.DateTime(), nullable=True),
        sa.Column('generated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pia_responses_id'), 'pia_responses', ['id'], unique=False)
    op.create_index(op.f('ix_pia_responses_user_id'), 'pia_responses', ['user_id'], unique=False)
    op.create_index(op.f('ix_pia_responses_ben'), 'pia_responses', ['ben'], unique=False)
    op.create_index(op.f('ix_pia_responses_frn'), 'pia_responses', ['frn'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pia_responses_frn'), table_name='pia_responses')
    op.drop_index(op.f('ix_pia_responses_ben'), table_name='pia_responses')
    op.drop_index(op.f('ix_pia_responses_user_id'), table_name='pia_responses')
    op.drop_index(op.f('ix_pia_responses_id'), table_name='pia_responses')
    op.drop_table('pia_responses')
