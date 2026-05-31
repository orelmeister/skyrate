from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from ..core.database import Base

class FrnStatusChangeQueue(Base):
    __tablename__ = "frn_status_changes_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, index=True, nullable=False)
    frn = Column(String(64), nullable=False)
    old_status = Column(String(128), nullable=True)
    new_status = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    processed = Column(Integer, default=0, nullable=False, index=True) # 0 = False, 1 = True
