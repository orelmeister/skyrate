"""
Background Scheduler
Handles periodic tasks like deadline checks, daily digests, and data syncing

Uses APScheduler for job scheduling
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.alert import AlertConfig
from ..models.user import User
from ..models.applicant import ApplicantProfile, ApplicantFRN, ApplicantAutoAppeal
from .alert_service import AlertService

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler: Optional[BackgroundScheduler] = None


def get_db():
    """Get database session for background tasks"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_upcoming_deadlines():
    """
    Check for approaching deadlines and send alerts.
    Runs every 6 hours.
    """
    logger.info("Running deadline check job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)
        
        # Get all users with deadline alerts enabled
        configs = db.query(AlertConfig).filter(
            AlertConfig.alert_on_deadline == True
        ).all()
        
        for config in configs:
            try:
                _check_user_deadlines(db, alert_service, config)
            except Exception as e:
                logger.error(f"Error checking deadlines for user {config.user_id}: {e}")
        
        logger.info(f"Deadline check complete. Processed {len(configs)} users.")
        
    except Exception as e:
        logger.error(f"Deadline check job failed: {e}")
    finally:
        db.close()


def _check_user_deadlines(db: Session, alert_service: AlertService, config: AlertConfig):
    """Check deadlines for a specific user"""
    
    user = db.query(User).filter(User.id == config.user_id).first()
    if not user:
        return
    
    warning_days = config.deadline_warning_days or 14
    
    # Check applicant appeal deadlines
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == user.id
    ).first()
    
    if profile:
        # Get appeals with approaching deadlines
        deadline_threshold = datetime.utcnow() + timedelta(days=warning_days)
        
        appeals = db.query(ApplicantAutoAppeal).filter(
            ApplicantAutoAppeal.applicant_profile_id == profile.id,
            ApplicantAutoAppeal.appeal_deadline <= deadline_threshold,
            ApplicantAutoAppeal.appeal_deadline > datetime.utcnow(),
            ApplicantAutoAppeal.status.in_(['draft', 'pending'])
        ).all()
        
        for appeal in appeals:
            days_remaining = (appeal.appeal_deadline - datetime.utcnow()).days
            
            # Only alert at specific intervals (14, 7, 3, 1 days)
            if days_remaining in [14, 7, 3, 1]:
                alert_service.alert_on_deadline(
                    user_id=user.id,
                    entity_id=appeal.frn,
                    entity_name=profile.organization_name,
                    deadline_type="Appeal Deadline",
                    deadline_date=appeal.appeal_deadline,
                    days_remaining=days_remaining
                )


def send_daily_digests():
    """
    Send daily digest emails to users who opted in.
    Runs at 8 AM every day.
    """
    logger.info("Running daily digest job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)
        
        # Get all users with daily digest enabled
        configs = db.query(AlertConfig).filter(
            AlertConfig.daily_digest == True
        ).all()
        
        sent_count = 0
        for config in configs:
            try:
                if alert_service.send_daily_digest(config.user_id):
                    sent_count += 1
            except Exception as e:
                logger.error(f"Error sending digest to user {config.user_id}: {e}")
        
        logger.info(f"Daily digest complete. Sent {sent_count} digests.")
        
    except Exception as e:
        logger.error(f"Daily digest job failed: {e}")
    finally:
        db.close()


def send_weekly_summaries():
    """
    Send weekly summary emails to users who opted in.
    Runs every Monday at 9 AM.
    """
    logger.info("Running weekly summary job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)
        
        # Get all users with digest enabled (same flag)
        configs = db.query(AlertConfig).filter(
            AlertConfig.daily_digest == True
        ).all()
        
        sent_count = 0
        for config in configs:
            try:
                if alert_service.send_weekly_summary(config.user_id):
                    sent_count += 1
            except Exception as e:
                logger.error(f"Error sending summary to user {config.user_id}: {e}")
        
        logger.info(f"Weekly summary complete. Sent {sent_count} summaries.")
        
    except Exception as e:
        logger.error(f"Weekly summary job failed: {e}")
    finally:
        db.close()


def sync_frn_statuses():
    """
    Sync FRN statuses from USAC and trigger alerts on changes.
    Runs every hour.
    """
    logger.info("Running FRN status sync job...")
    
    db = SessionLocal()
    try:
        # Get all applicant FRNs that need checking
        frns = db.query(ApplicantFRN).filter(
            ApplicantFRN.status.notin_(['Funded', 'Cancelled', 'Denied - Final'])
        ).all()
        
        if not frns:
            logger.info("No FRNs to sync")
            return
        
        from ..services.usac_service import USACService
        usac_service = USACService(db)
        alert_service = AlertService(db)
        
        updated_count = 0
        for frn_record in frns:
            try:
                # Get updated status from USAC
                frn_data = usac_service.get_frn_details(frn_record.frn)
                
                if frn_data and frn_data.get('status'):
                    new_status = frn_data['status']
                    old_status = frn_record.status
                    
                    if new_status != old_status:
                        # Update status
                        frn_record.status = new_status
                        frn_record.last_checked = datetime.utcnow()
                        updated_count += 1
                        
                        # Get user for this FRN
                        profile = db.query(ApplicantProfile).filter(
                            ApplicantProfile.id == frn_record.applicant_profile_id
                        ).first()
                        
                        if profile:
                            # Check if this is a denial
                            if 'denied' in new_status.lower():
                                alert_service.alert_on_denial(
                                    user_id=profile.user_id,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name,
                                    denial_reason=frn_data.get('denial_reason', 'Unknown'),
                                    amount=float(frn_record.amount_requested or 0),
                                    funding_year=frn_record.funding_year
                                )
                            else:
                                # Regular status change
                                alert_service.alert_on_status_change(
                                    user_id=profile.user_id,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name,
                                    old_status=old_status,
                                    new_status=new_status,
                                    amount=float(frn_record.amount_requested or 0)
                                )
            
            except Exception as e:
                logger.error(f"Error syncing FRN {frn_record.frn}: {e}")
        
        db.commit()
        logger.info(f"FRN sync complete. Updated {updated_count} FRNs.")
        
    except Exception as e:
        logger.error(f"FRN sync job failed: {e}")
    finally:
        db.close()


def init_scheduler():
    """Initialize the background scheduler with all jobs"""
    global scheduler
    
    if scheduler is not None:
        logger.warning("Scheduler already initialized")
        return
    
    scheduler = BackgroundScheduler()
    
    # Deadline check - every 6 hours
    scheduler.add_job(
        check_upcoming_deadlines,
        trigger=IntervalTrigger(hours=6),
        id='check_deadlines',
        name='Check upcoming deadlines',
        replace_existing=True
    )
    
    # Daily digest - 8 AM every day
    scheduler.add_job(
        send_daily_digests,
        trigger=CronTrigger(hour=8, minute=0),
        id='daily_digest',
        name='Send daily digest emails',
        replace_existing=True
    )
    
    # Weekly summary - Monday 9 AM
    scheduler.add_job(
        send_weekly_summaries,
        trigger=CronTrigger(day_of_week='mon', hour=9, minute=0),
        id='weekly_summary',
        name='Send weekly summary emails',
        replace_existing=True
    )
    
    # FRN status sync - every hour
    scheduler.add_job(
        sync_frn_statuses,
        trigger=IntervalTrigger(hours=1),
        id='sync_frn_statuses',
        name='Sync FRN statuses from USAC',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Background scheduler started with jobs:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name} ({job.id})")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    global scheduler
    
    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Background scheduler shut down")


def get_scheduler_status():
    """Get status of all scheduled jobs"""
    if scheduler is None:
        return {"status": "not_running", "jobs": []}
    
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })
    
    return {
        "status": "running",
        "jobs": jobs
    }


def run_job_now(job_id: str) -> bool:
    """Manually trigger a scheduled job"""
    if scheduler is None:
        return False
    
    job = scheduler.get_job(job_id)
    if job:
        job.modify(next_run_time=datetime.now())
        return True
    return False
