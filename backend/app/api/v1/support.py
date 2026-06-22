"""
Support Ticket API Endpoints
Handles support ticket creation, viewing, and messaging.
Supports both authenticated users and guest visitors.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
import logging

from ...core.config import settings
from ...core.database import get_db
from ...core.security import get_current_user, decode_token
from ...models.user import User, UserRole
from ...models.support_ticket import (
    SupportTicket, TicketMessage,
    TicketStatus, TicketPriority, TicketCategory, TicketSource
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])


@router.get("/_debug/telegram")
def _debug_telegram(token: str = ""):
    """Diagnostic: synchronously send a test alert and surface the Telegram API response.

    Protected by a static token to avoid being abused. Returns
    {ok, status, response, has_token, has_chat_id, chat_id_prefix}.
    """
    if token != "sk-tg-diag-2026":
        raise HTTPException(status_code=404, detail="not found")
    from ...services.telegram_alerts import send_alert_debug
    return send_alert_debug(title="diagnostic ping", body="from /_debug/telegram")


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

    # Capture client IP address
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    else:
        client_ip = (request.client.host if request.client else "unknown") or "unknown"

    # Check email blocklist
    user_email = (user.email if user else data.guest_email or "").strip()
    is_banned_email = False
    if settings.BANNED_EMAILS:
        is_banned_email = any(
            user_email.lower() == banned.lower().strip() 
            for banned in settings.BANNED_EMAILS
        )

    if is_banned_email:
        logger.warning(
            f"Shadow-blocked ticket submission from banned email: {user_email} (IP: {client_ip})"
        )
        return {
            "success": True,
            "ticket": {
                "id": 9999,
                "user_id": user.id if user else None,
                "guest_name": data.guest_name,
                "guest_email": data.guest_email,
                "subject": data.subject,
                "message": data.message,
                "status": TicketStatus.OPEN.value,
                "priority": TicketPriority.MEDIUM.value,
                "category": data.category or TicketCategory.GENERAL.value,
                "source": data.source or TicketSource.CHAT_WIDGET.value,
                "ip_address": client_ip,
                "assigned_to": None,
                "admin_notes": "Shadow-blocked",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "resolved_at": None,
                "message_count": 1,
                "user_email": user_email,
                "user_name": data.guest_name or "Guest"
            },
            "message": "Support ticket created successfully. We'll get back to you soon!"
        }

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
        ip_address=client_ip,
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

    # Telegram instant alert (free, ~1s) so we never miss a ticket again.
    try:
        from ...services.telegram_alerts import send_alert
        reporter = ticket.user_email or ticket.guest_email or "unknown"
        send_alert(
            title=f"New Ticket #{ticket.id}: {ticket.subject}",
            body=(
                f"From: {reporter}\n"
                f"Category: {ticket.category}  Source: {ticket.source}\n\n"
                f"{(ticket.message or '')[:1500]}"
            ),
            severity="warn",
            link="https://skyrate.ai/admin",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Telegram ticket alert failed: {e}")

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

    # Users can only view their own tickets; admins/super can view any
    if ticket.user_id != current_user.id and current_user.role not in [UserRole.ADMIN.value, "super"]:
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

    # Users can only message their own tickets; admins/super can message any
    if ticket.user_id != current_user.id and current_user.role not in [UserRole.ADMIN.value, "super"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    is_admin = current_user.role in [UserRole.ADMIN.value, "super"]

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
        
        # Send email notification to user on admin reply
        try:
            from ...services.email_service import get_email_service
            email_svc = get_email_service()
            user_email = ticket.user_email
            if user_email:
                formatted_body = data.message
                if not ("<p>" in formatted_body or "<br>" in formatted_body or "</div>" in formatted_body):
                    formatted_body = formatted_body.replace("\n", "<br>")

                html_content = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6; padding: 20px; background-color: #f8fafc;">
                    <div style="background-color: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h2 style="color: #7c3aed; margin-top: 0; font-size: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px;">New Reply to Support Ticket #{ticket.id}</h2>
                        <p style="font-size: 14px; color: #64748b; margin-top: 8px;"><strong>Subject:</strong> {ticket.subject}</p>
                        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 16px 0;">
                        <div style="font-size: 15px; color: #334155; line-height: 1.6;">
                            {formatted_body}
                        </div>
                        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;">
                        <p style="font-size: 13px; color: #64748b; text-align: center; margin-bottom: 0;">
                            You can view and reply to this ticket directly in the app.
                        </p>
                    </div>
                </div>
                """
                email_svc.send_email(
                    to_email=user_email,
                    subject=f"RE: [Ticket #{ticket.id}] {ticket.subject}",
                    html_content=html_content,
                    text_content=f"You received a new reply on Ticket #{ticket.id}:\n\n{data.message}",
                    email_type='support'
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send support ticket reply email: {e}")
    else:
        ticket.status = TicketStatus.OPEN.value  # Re-open if user replies

    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)

    return {
        "success": True,
        "message": message.to_dict()
    }


# ==================== ATTACHMENTS / VOICE NOTES ====================

# Allowed attachment MIME types (voice notes + common docs/images).
ALLOWED_ATTACHMENT_MIME_PREFIXES = ("audio/", "image/")
ALLOWED_ATTACHMENT_MIME_EXACT = {"application/pdf"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB


def _assert_ticket_access(ticket: Optional[SupportTicket], current_user: User):
    """Raise if the ticket is missing or the user may not access it."""
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    is_admin = current_user.role in [UserRole.ADMIN.value, "super"]
    if ticket.user_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return is_admin


@router.post("/tickets/{ticket_id}/messages/upload")
async def upload_message_attachment(
    ticket_id: int,
    message: str = Form(""),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attach a voice note (or file) to a ticket as a new message.

    Accepts multipart/form-data with an optional text `message` plus a `file`.
    The binary is stored in-DB (DO App Platform filesystem is ephemeral).
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    is_admin = _assert_ticket_access(ticket, current_user)

    mime = (file.content_type or "application/octet-stream").lower()
    if not (mime.startswith(ALLOWED_ATTACHMENT_MIME_PREFIXES) or mime in ALLOWED_ATTACHMENT_MIME_EXACT):
        raise HTTPException(status_code=400, detail=f"Unsupported attachment type: {mime}")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty attachment")
    if len(raw) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment too large (max 10 MB)")

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_type="admin" if is_admin else "user",
        sender_id=current_user.id,
        sender_name=(
            f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            or current_user.email
        ),
        message=(message or "").strip(),
        file_data=raw,
        file_name=file.filename or "voice-note.webm",
        mime_type=mime,
    )
    db.add(msg)

    # Mirror the status transitions used by text replies.
    ticket.status = (
        TicketStatus.WAITING_USER.value if is_admin else TicketStatus.OPEN.value
    )
    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)

    # Instant Telegram alert on inbound user attachments so nothing is missed.
    if not is_admin:
        try:
            from ...services.telegram_alerts import send_alert
            send_alert(
                title=f"Voice/attachment on Ticket #{ticket.id}",
                body=f"From: {ticket.user_email or 'user'}\nFile: {msg.file_name} ({mime})",
                severity="warn",
                link="https://skyrate.ai/admin",
            )
        except Exception as e:
            logger.warning(f"Telegram attachment alert failed: {e}")

    return {"success": True, "message": msg.to_dict()}


@router.get("/tickets/{ticket_id}/messages/{message_id}/attachment")
async def get_message_attachment(
    ticket_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a message's binary attachment (voice note / file)."""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    _assert_ticket_access(ticket, current_user)

    msg = (
        db.query(TicketMessage)
        .filter(TicketMessage.id == message_id, TicketMessage.ticket_id == ticket_id)
        .first()
    )
    if not msg or msg.file_data is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return Response(
        content=msg.file_data,
        media_type=msg.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{msg.file_name or "attachment"}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.post("/tickets/{ticket_id}/read")
async def mark_ticket_read(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark messages from the opposite party as read (for unread badges)."""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    is_admin = _assert_ticket_access(ticket, current_user)

    # Admins read user messages; users read admin messages.
    other_party = "user" if is_admin else "admin"
    now = datetime.utcnow()
    updated = (
        db.query(TicketMessage)
        .filter(
            TicketMessage.ticket_id == ticket_id,
            TicketMessage.sender_type == other_party,
            TicketMessage.read_at.is_(None),
        )
        .update({TicketMessage.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"success": True, "marked_read": updated}
