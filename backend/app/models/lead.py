"""
Lead Model
Captures inbound leads from public forms (e.g. erateapp.com get-started page,
free FRN tracker, etc.) before they convert into paid SkyRate users.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime

from ..core.database import Base


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)

    # Contact info
    name = Column(String(255), nullable=False)
    email = Column(String(255), index=True, nullable=False)
    phone = Column(String(50), nullable=True)
    organization = Column(String(255), nullable=True)

    # Role / qualification
    role = Column(String(32), nullable=False, default="unsure")  # consultant|vendor|applicant|unsure
    ben = Column(String(50), nullable=True)
    student_count = Column(Integer, nullable=True)

    # Attribution
    source = Column(String(255), nullable=True)
    utm_source = Column(String(120), nullable=True)
    utm_medium = Column(String(120), nullable=True)
    utm_campaign = Column(String(120), nullable=True)

    # Free-form
    notes = Column(Text, nullable=True)

    # Request metadata
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(500), nullable=True)

    # Pipeline
    status = Column(String(32), nullable=False, default="new", index=True)  # new|contacted|qualified|closed|spam
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "organization": self.organization,
            "role": self.role,
            "ben": self.ben,
            "student_count": self.student_count,
            "source": self.source,
            "utm_source": self.utm_source,
            "utm_medium": self.utm_medium,
            "utm_campaign": self.utm_campaign,
            "notes": self.notes,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "status": self.status,
            "assigned_to_user_id": self.assigned_to_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
