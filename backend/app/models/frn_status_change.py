from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.sql import func

from ..core.database import Base


class FrnStatusChangeQueue(Base):
    __tablename__ = "frn_status_changes_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, index=True, nullable=False)
    frn = Column(String(64), nullable=False)
    ben = Column(String(64), nullable=True, index=True)
    scope_type = Column(String(16), nullable=True)  # 'ben', 'spin', 'crn'
    scope_value = Column(String(128), nullable=True)
    old_status = Column(String(128), nullable=True)
    new_status = Column(String(128), nullable=True)
    old_amount = Column(Float, nullable=True)
    new_amount = Column(Float, nullable=True)
    entity_name = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    processed = Column(Integer, default=0, nullable=False, index=True)  # 0=pending, 1=processed
    processed_at = Column(DateTime, nullable=True)
