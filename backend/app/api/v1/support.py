"""
Support Ticket API Endpoints
Handles support ticket creation, viewing, and messaging.
Supports both authenticated users and guest visitors.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

from ...core.database import get_db
from ...core.security import get_current_user, decode_token
from ...models.user import User, UserRole
from ...models.support_ticket import (
    SupportTicket, TicketMessage,
    TicketStatus, TicketPriority, TicketCategory, TicketSource
)

router = APIRouter(prefix="/support", tags=["Support"])


# ==================== SCHEMAS ====================

class CreateTicketRequest(BaseModel):
    subject: str
    message: str
    category: Optional[str] = "general"
    source: Optional[str] = "chat_widget"
    # Guest fields (only used if not authenticated)
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None


class AddMessageRequest(BaseModel):
    message: str


# ==================== HELPER ====================

def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    """Try to get current user from token, return None if not authenticated"""
    try:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_token(token)
            if payload:
                user_id = payload.get("sub")
                if user_id:
                    return db.query(User).filter(User.id == int(user_id)).first()
    except Exception:
        pass
    return None


# ==================== ENDPOINTS ====================

@router.post("/tickets")
async def create_ticket(
    data: CreateTicketRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Create a new support ticket.
    Works for both authenticated users and guests.
    Guests must provide name and email.
    """
    user = get_optional_user(request, db)

    if not user and not data.guest_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guest email is required for unauthenticated tickets"
        )

    ticket = SupportTicket(
        user_id=user.id if user else None,
        guest_name=data.guest_name if not user else None,
        guest_email=data.guest_email if not user else None,
        subject=data.subject,
        message=data.message,
        category=data.category or TicketCategory.GENERAL.value,
        source=data.source or TicketSource.CHAT_WIDGET.value,
        status=TicketStatus.OPEN.value,
        priority=TicketPriority.MEDIUM.value,
    )
    db.add(ticket)
    db.flush()

    # Create the initial message as well
    initial_message = TicketMessage(
        ticket_id=ticket.id,
        sender_type="user",
        sender_id=user.id if user else None,
        sender_name=(
            f"{user.first_name or ''} {user.last_name or ''}".strip()
            if user else data.guest_name or "Guest"
        ),
        message=data.message,
    )
    db.add(initial_message)
    db.commit()
    db.refresh(ticket)

    # Send notification email to admin
    try:
        from ...services.email_service import EmailService
        email_service = EmailService()
        email_service.send_email(
            to_email="admin@skyrate.ai",
            subject=f"[New Ticket #{ticket.id}] {ticket.subject}",
            html_content=f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #7c3aed;">New Support Ticket</h2>
                <p><strong>From:</strong> {ticket.user_email or ticket.guest_email}</p>
                <p><strong>Category:</strong> {ticket.category}</p>
                <p><strong>Source:</strong> {ticket.source}</p>
                <hr>
                <p><strong>Subject:</strong> {ticket.subject}</p>
                <p>{ticket.message}</p>
                <hr>
                <p style="color: #64748b; font-size: 12px;">
                    <a href="https://skyrate.ai/admin">View in Admin Dashboard</a>
                </p>
            </div>
            """,
            email_type='support'
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to send ticket notification: {e}")

    return {
        "success": True,
        "ticket": ticket.to_dict(),
        "message": "Support ticket created successfully. We'll get back to you soon!"
    }


@router.get("/tickets")
async def list_my_tickets(
    status_filter: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List tickets for the current authenticated user"""
    query = db.query(SupportTicket).filter(SupportTicket.user_id == current_user.id)

    if status_filter:
        query = query.filter(SupportTicket.status == status_filter)

    total = query.count()
    tickets = query.order_by(SupportTicket.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "success": True,
        "total": total,
        "tickets": [t.to_dict() for t in tickets]
    }


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific ticket with all messages"""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Users can only view their own tickets; admins can view any
    if ticket.user_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")

    return {
        "success": True,
        "ticket": ticket.to_dict_with_messages()
    }


@router.post("/tickets/{ticket_id}/messages")
async def add_message(
    ticket_id: int,
    data: AddMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a message to an existing ticket"""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Users can only message their own tickets; admins can message any
    if ticket.user_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Not authorized")

    is_admin = current_user.role == UserRole.ADMIN.value

    message = TicketMessage(
        ticket_id=ticket.id,
        sender_type="admin" if is_admin else "user",
        sender_id=current_user.id,
        sender_name=f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email,
        message=data.message,
    )
    db.add(message)

    # Update ticket status based on who replied
    if is_admin:
        ticket.status = TicketStatus.WAITING_USER.value
    else:
        ticket.status = TicketStatus.OPEN.value  # Re-open if user replies

    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)

    return {
        "success": True,
        "message": message.to_dict()
    }
