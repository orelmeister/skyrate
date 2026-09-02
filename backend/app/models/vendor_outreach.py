"""Vendor outreach log — a lightweight mini-CRM activity trail.

Each row is one outreach touch (email/call/note) a vendor logs against a prospect
entity, so the Predicted Leads / Saved Leads views can show a history. Sending is
user-initiated from the vendor's own mail client (mailto); this table records the
touch. New table only — created on startup via Base.metadata.create_all.
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime

from ..core.database import Base


class VendorOutreach(Base):
    __tablename__ = "vendor_outreach"

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(Integer, nullable=False, index=True)
    ben = Column(String(32), nullable=True, index=True)
    application_number = Column(String(32), nullable=True)
    entity_name = Column(String(255), nullable=True)
    channel = Column(String(16), nullable=False, default="email")   # email | call | note
    to_email = Column(String(255), nullable=True)
    subject = Column(String(512), nullable=True)
    body = Column(Text, nullable=True)
    status = Column(String(24), nullable=False, default="logged")   # logged | sent | failed
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "ben": self.ben,
            "application_number": self.application_number,
            "entity_name": self.entity_name,
            "channel": self.channel,
            "to_email": self.to_email,
            "subject": self.subject,
            "body": self.body,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
