"""Add Bid Compliance Copilot tables (vendor_bid_analyses, fcc_kb_chunks, appeal_precedents)

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-09-01 00:00:00.000000

Vendor-side Bid Compliance Copilot: a vendor uploads their bid, we pull the
matching Form 470, and an AI grounded in the FCC rules + an appeal/denial
precedent library scores it for compliance and suggests refinements.

- vendor_bid_analyses : one scored bid per row (score, sub-scores, findings,
  refined draft, refine-chat).
- fcc_kb_chunks       : retrieval-augmented knowledge base (47 CFR Part 54
  Subpart F, ESL, appeal/denial passages). Retrieval is TF-IDF in Python.
- appeal_precedents   : structured FCC/USAC appeal & denial fact patterns.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 's4t5u6v7w8x9'
down_revision = 'r3s4t5u6v7w8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'vendor_bid_analyses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_profile_id', sa.Integer(), nullable=False),
        sa.Column('form_470_number', sa.String(length=40), nullable=True),
        sa.Column('ben', sa.String(length=40), nullable=True),
        sa.Column('funding_year', sa.Integer(), nullable=True),
        sa.Column('applicant_name', sa.String(length=255), nullable=True),
        sa.Column('bid_filename', sa.String(length=255), nullable=True),
        sa.Column('bid_text', sa.Text(), nullable=True),
        sa.Column('overall_score', sa.Float(), nullable=True),
        sa.Column('subscores_json', sa.JSON(), nullable=True),
        sa.Column('findings_json', sa.JSON(), nullable=True),
        sa.Column('context_json', sa.JSON(), nullable=True),
        sa.Column('sources_json', sa.JSON(), nullable=True),
        sa.Column('refined_bid_text', sa.Text(), nullable=True),
        sa.Column('chat_history_json', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='scored'),
        sa.Column('engine', sa.String(length=40), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['vendor_profile_id'], ['vendor_profiles.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vendor_bid_analyses_id', 'vendor_bid_analyses', ['id'], unique=False)
    op.create_index('ix_vendor_bid_analyses_vendor_profile_id', 'vendor_bid_analyses', ['vendor_profile_id'], unique=False)
    op.create_index('ix_vendor_bid_analyses_form_470_number', 'vendor_bid_analyses', ['form_470_number'], unique=False)
    op.create_index('ix_vendor_bid_analyses_vendor_created', 'vendor_bid_analyses', ['vendor_profile_id', 'created_at'], unique=False)

    op.create_table(
        'fcc_kb_chunks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=20), nullable=False, server_default='cfr'),
        sa.Column('citation', sa.String(length=160), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('funding_year', sa.Integer(), nullable=True),
        sa.Column('seed_key', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fcc_kb_chunks_id', 'fcc_kb_chunks', ['id'], unique=False)
    op.create_index('ix_fcc_kb_chunks_source', 'fcc_kb_chunks', ['source_type'], unique=False)
    op.create_index('ix_fcc_kb_chunks_seed_key', 'fcc_kb_chunks', ['seed_key'], unique=True)

    op.create_table(
        'appeal_precedents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('docket', sa.String(length=40), nullable=True),
        sa.Column('release_id', sa.String(length=80), nullable=True),
        sa.Column('title', sa.String(length=300), nullable=True),
        sa.Column('issue_tags_json', sa.JSON(), nullable=True),
        sa.Column('outcome', sa.String(length=20), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('funding_year', sa.Integer(), nullable=True),
        sa.Column('seed_key', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_appeal_precedents_id', 'appeal_precedents', ['id'], unique=False)
    op.create_index('ix_appeal_precedents_outcome', 'appeal_precedents', ['outcome'], unique=False)
    op.create_index('ix_appeal_precedents_seed_key', 'appeal_precedents', ['seed_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_appeal_precedents_seed_key', table_name='appeal_precedents')
    op.drop_index('ix_appeal_precedents_outcome', table_name='appeal_precedents')
    op.drop_index('ix_appeal_precedents_id', table_name='appeal_precedents')
    op.drop_table('appeal_precedents')

    op.drop_index('ix_fcc_kb_chunks_seed_key', table_name='fcc_kb_chunks')
    op.drop_index('ix_fcc_kb_chunks_source', table_name='fcc_kb_chunks')
    op.drop_index('ix_fcc_kb_chunks_id', table_name='fcc_kb_chunks')
    op.drop_table('fcc_kb_chunks')

    op.drop_index('ix_vendor_bid_analyses_vendor_created', table_name='vendor_bid_analyses')
    op.drop_index('ix_vendor_bid_analyses_form_470_number', table_name='vendor_bid_analyses')
    op.drop_index('ix_vendor_bid_analyses_vendor_profile_id', table_name='vendor_bid_analyses')
    op.drop_index('ix_vendor_bid_analyses_id', table_name='vendor_bid_analyses')
    op.drop_table('vendor_bid_analyses')
