"""
Support Ticket Model
Handles support tickets and messages for the chat/support widget
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class TicketStatus(str, enum.Enum):
    """Status of a support ticket"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_USER = "waiting_user"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    """Priority level of a support ticket"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketCategory(str, enum.Enum):
    """Category of the support ticket"""
    GENERAL = "general"
    BILLING = "billing"
    TECHNICAL = "technical"
    ERATE = "erate"
    ACCOUNT = "account"
    FEATURE_REQUEST = "feature_request"
    BUG_REPORT = "bug_report"


class TicketSource(str, enum.Enum):
    """Where the ticket was created from"""
    CHAT_WIDGET = "chat_widget"
    LANDING_PAGE = "landing_page"
    DASHBOARD = "dashboard"
    EMAIL = "email"
    ADMIN = "admin"


class SupportTicket(Base):
    """
    Support ticket record.
    Supports both authenticated users and guest visitors (from landing page).
    """
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)

    # User reference (nullable for guest tickets)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Guest info (used when user_id is null)
    guest_name = Column(String(255), nullable=True)
    guest_email = Column(String(255), nullable=True)

    # Ticket details
    subject = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)  # Initial message
    status = Column(String(20), default=TicketStatus.OPEN.value, index=True)
    priority = Column(String(20), default=TicketPriority.MEDIUM.value)
    category = Column(String(30), default=TicketCategory.GENERAL.value)
    source = Column(String(30), default=TicketSource.CHAT_WIDGET.value)

    # Admin fields
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="support_tickets")
    assignee = relationship("User", foreign_keys=[assigned_to])
    messages = relationship("TicketMessage", back_populates="ticket", order_by="TicketMessage.created_at")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "guest_name": self.guest_name,
            "guest_email": self.guest_email,
            "subject": self.subject,
            "message": self.message,
            "status": self.status,
            "priority": self.priority,
            "category": self.category,
            "source": self.source,
            "assigned_to": self.assigned_to,
            "admin_notes": self.admin_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "message_count": len(self.messages) if self.messages else 0,
            "user_email": self.user.email if self.user else self.guest_email,
            "user_name": (
                f"{self.user.first_name or ''} {self.user.last_name or ''}".strip()
                if self.user else self.guest_name
            ),
        }

    def to_dict_with_messages(self) -> dict:
        data = self.to_dict()
        data["messages"] = [m.to_dict() for m in self.messages] if self.messages else []
        return data


class TicketMessage(Base):
    """
    Individual message within a support ticket thread.
    """
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id"), nullable=False, index=True)

    # Who sent it
    sender_type = Column(String(10), nullable=False)  # 'user', 'admin', 'system'
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sender_name = Column(String(255), nullable=True)  # Display name

    # Message content
    message = Column(Text, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    ticket = relationship("SupportTicket", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "sender_type": self.sender_type,
            "sender_id": self.sender_id,
            "sender_name": self.sender_name or (
                f"{self.sender.first_name or ''} {self.sender.last_name or ''}".strip()
                if self.sender else "System"
            ),
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
