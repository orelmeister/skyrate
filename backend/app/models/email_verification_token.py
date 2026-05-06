"""
EmailVerificationToken model.

Single-use, server-side magic-link tokens. The raw token string is sent in the
email; only its SHA-256 hash is stored in the DB so a DB leak does not enable
account takeover. used_at is stamped when redeemed.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..core.database import Base


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    purpose = Column(String(32), nullable=False, default="magic_login")  # 'winback' | 'magic_login' | 'identifier_reminder'
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", backref="email_verification_tokens")

    def is_valid(self, now: datetime | None = None) -> bool:
        now = now or datetime.utcnow()
        return self.used_at is None and self.expires_at > now
