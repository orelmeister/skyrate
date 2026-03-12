"""
FRN Reports API
Manage FRN watch monitors that send periodic email reports
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.frn_watch import FRNWatch, WatchType, WatchFrequency
from ...models.frn_report_history import FRNReportHistory

router = APIRouter(prefix="/frn-reports", tags=["FRN Reports"])


# ==================== SCHEMAS ====================

class CreateWatchRequest(BaseModel):
    name: str
    watch_type: str = WatchType.PORTFOLIO.value
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    frequency: str = WatchFrequency.WEEKLY.value
    recipient_email: str
    cc_emails: Optional[List[str]] = None
    delivery_mode: str = "full_email"
    notify_sms: bool = False
    sms_phone: Optional[str] = None
    funding_year: Optional[int] = None
    status_filter: Optional[str] = None
    include_funded: bool = True
    include_pending: bool = True
    include_denied: bool = True
    include_summary: bool = True
    include_details: bool = True
    include_changes: bool = True


class UpdateWatchRequest(BaseModel):
    name: Optional[str] = None
    frequency: Optional[str] = None
    recipient_email: Optional[str] = None
    cc_emails: Optional[List[str]] = None
    delivery_mode: Optional[str] = None
    notify_sms: Optional[bool] = None
    sms_phone: Optional[str] = None
    funding_year: Optional[int] = None
    status_filter: Optional[str] = None
    include_funded: Optional[bool] = None
    include_pending: Optional[bool] = None
    include_denied: Optional[bool] = None
    include_summary: Optional[bool] = None
    include_details: Optional[bool] = None
    include_changes: Optional[bool] = None
    is_active: Optional[bool] = None


# ==================== ENDPOINTS ====================

@router.get("")
async def list_watches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all FRN watches for the current user"""
    watches = db.query(FRNWatch).filter(
        FRNWatch.user_id == current_user.id
    ).order_by(FRNWatch.created_at.desc()).all()
    
    return {
        "success": True,
        "watches": [w.to_dict() for w in watches],
        "total": len(watches)
    }


@router.post("")
async def create_watch(
    data: CreateWatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new FRN watch monitor"""
    # Validate watch_type
    valid_types = [t.value for t in WatchType]
    if data.watch_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid watch_type. Must be one of: {valid_types}"
        )
    
    # Validate frequency
    valid_freqs = [f.value for f in WatchFrequency]
    if data.frequency not in valid_freqs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid frequency. Must be one of: {valid_freqs}"
        )
    
    # Limit watches per user (max 10)
    existing_count = db.query(FRNWatch).filter(
        FRNWatch.user_id == current_user.id,
        FRNWatch.is_active == True
    ).count()
    
    if existing_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum of 10 active watches allowed. Deactivate or delete existing watches first."
        )
    
    # For FRN/BEN watches, target_id is required
    if data.watch_type in (WatchType.FRN.value, WatchType.BEN.value) and not data.target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"target_id is required for {data.watch_type} watch type"
        )
    
    watch = FRNWatch(
        user_id=current_user.id,
        name=data.name,
        watch_type=data.watch_type,
        target_id=data.target_id,
        target_name=data.target_name,
        frequency=data.frequency,
        recipient_email=data.recipient_email,
        cc_emails=data.cc_emails or [],
        delivery_mode=data.delivery_mode,
        notify_sms=data.notify_sms,
        sms_phone=data.sms_phone,
        funding_year=data.funding_year,
        status_filter=data.status_filter,
        include_funded=data.include_funded,
        include_pending=data.include_pending,
        include_denied=data.include_denied,
        include_summary=data.include_summary,
        include_details=data.include_details,
        include_changes=data.include_changes,
        is_active=True,
    )
    
    # Calculate first send time
    watch.next_send_at = watch.calculate_next_send()
    
    db.add(watch)
    db.commit()
    db.refresh(watch)
    
    return {
        "success": True,
        "watch": watch.to_dict(),
        "message": f"Watch created. First report will be sent on {watch.next_send_at.strftime('%B %d, %Y at %H:%M UTC')}."
    }


@router.get("/{watch_id}")
async def get_watch(
    watch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific FRN watch"""
    watch = db.query(FRNWatch).filter(
        FRNWatch.id == watch_id,
        FRNWatch.user_id == current_user.id
    ).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    
    return {"success": True, "watch": watch.to_dict()}


@router.put("/{watch_id}")
async def update_watch(
    watch_id: int,
    data: UpdateWatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an FRN watch"""
    watch = db.query(FRNWatch).filter(
        FRNWatch.id == watch_id,
        FRNWatch.user_id == current_user.id
    ).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    
    update_data = data.dict(exclude_unset=True)
    
    # Validate frequency if changing
    if "frequency" in update_data:
        valid_freqs = [f.value for f in WatchFrequency]
        if update_data["frequency"] not in valid_freqs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid frequency. Must be one of: {valid_freqs}"
            )
    
    for field, value in update_data.items():
        if hasattr(watch, field):
            setattr(watch, field, value)
    
    # Recalculate next send if frequency changed
    if "frequency" in update_data:
        watch.next_send_at = watch.calculate_next_send()
    
    db.commit()
    db.refresh(watch)
    
    return {"success": True, "watch": watch.to_dict()}


@router.delete("/{watch_id}")
async def delete_watch(
    watch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an FRN watch"""
    watch = db.query(FRNWatch).filter(
        FRNWatch.id == watch_id,
        FRNWatch.user_id == current_user.id
    ).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    
    db.delete(watch)
    db.commit()
    
    return {"success": True, "deleted": True}


@router.post("/{watch_id}/send-now")
async def send_report_now(
    watch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Immediately send a report for this watch (doesn't affect schedule)"""
    watch = db.query(FRNWatch).filter(
        FRNWatch.id == watch_id,
        FRNWatch.user_id == current_user.id
    ).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    
    try:
        from ...services.frn_report_service import FRNReportService
        report_service = FRNReportService(db)
        result = report_service.process_single_watch(watch)
        
        return {
            "success": result.get("success", False),
            "message": result.get("message", "Report sent"),
            "frn_count": result.get("frn_count", 0)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send report: {str(e)}"
        )


@router.post("/{watch_id}/toggle")
async def toggle_watch(
    watch_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle a watch active/inactive"""
    watch = db.query(FRNWatch).filter(
        FRNWatch.id == watch_id,
        FRNWatch.user_id == current_user.id
    ).first()
    
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    
    watch.is_active = not watch.is_active
    
    if watch.is_active:
        watch.next_send_at = watch.calculate_next_send()
    
    db.commit()
    db.refresh(watch)
    
    return {
        "success": True,
        "watch": watch.to_dict(),
        "message": f"Watch {'activated' if watch.is_active else 'paused'}"
    }


# ==================== REPORT HISTORY ====================

@router.get("/history/list")
async def list_report_history(
    limit: int = Query(default=20, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List past reports for the current user"""
    reports = db.query(FRNReportHistory).filter(
        FRNReportHistory.user_id == current_user.id
    ).order_by(FRNReportHistory.generated_at.desc()).limit(limit).all()
    
    return {
        "success": True,
        "reports": [r.to_dict() for r in reports],
        "total": len(reports)
    }


@router.get("/history/{report_id}")
async def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific report with full HTML content"""
    from ...services.frn_report_service import FRNReportService
    report_service = FRNReportService(db)
    
    report = db.query(FRNReportHistory).filter(
        FRNReportHistory.id == report_id,
        FRNReportHistory.user_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Mark as viewed
    html = report_service.get_report_html(report_id, current_user.id)
    
    return {
        "success": True,
        "report": report.to_dict(),
        "html": html
    }
