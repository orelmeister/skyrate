"""
FRN Report Service (v2 - Consolidated)
Generates consolidated email reports and stores them for in-app viewing.
Groups all due watches per user into a single email.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from collections import defaultdict

from ..models.frn_watch import FRNWatch, WatchType, WatchFrequency, DeliveryMode
from ..models.frn_report_history import FRNReportHistory
from ..models.user import User
from ..models.consultant import ConsultantProfile, ConsultantSchool
from ..models.vendor import VendorProfile
from ..models.alert import AlertType, AlertPriority

logger = logging.getLogger(__name__)

# Max individual change rows shown in email
MAX_CHANGES_IN_EMAIL = 20


class FRNReportService:
    """Service for generating consolidated FRN status reports"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== PUBLIC API ====================
    
    def process_due_watches(self) -> Dict[str, Any]:
        """
        Process all watches that are due to send.
        Groups by user_id so each user gets at most ONE email + ONE SMS.
        Called by the scheduler every hour.
        """
        now = datetime.utcnow()
        
        due_watches = self.db.query(FRNWatch).filter(
            FRNWatch.is_active == True,
            FRNWatch.next_send_at <= now
        ).all()
        
        if not due_watches:
            return {"processed": 0, "users": 0, "emails_sent": 0, "sms_sent": 0, "errors": 0}
        
        # Group watches by user_id
        user_watches = defaultdict(list)
        for watch in due_watches:
            user_watches[watch.user_id].append(watch)
        
        emails_sent = 0
        sms_sent = 0
        errors = 0
        
        for user_id, watches in user_watches.items():
            try:
                user = self.db.query(User).filter(User.id == user_id).first()
                if not user:
                    logger.error(f"User {user_id} not found, skipping {len(watches)} watches")
                    errors += len(watches)
                    continue
                
                result = self._process_user_batch(user, watches)
                if result.get("email_sent"):
                    emails_sent += 1
                if result.get("sms_sent"):
                    sms_sent += 1
                if result.get("errors"):
                    errors += result["errors"]
                    
            except Exception as e:
                logger.error(f"Error processing watches for user {user_id}: {e}")
                for w in watches:
                    w.last_error = str(e)
                errors += len(watches)
        
        self.db.commit()
        
        return {
            "processed": len(due_watches),
            "users": len(user_watches),
            "emails_sent": emails_sent,
            "sms_sent": sms_sent,
            "errors": errors
        }
    
    def process_single_watch(self, watch: FRNWatch) -> Dict[str, Any]:
        """
        Process a single watch (used by 'send now' button).
        Still generates a proper report and stores in history.
        """
        user = self.db.query(User).filter(User.id == watch.user_id).first()
        if not user:
            return {"success": False, "message": "User not found", "frn_count": 0}
        
        return self._process_user_batch(user, [watch], is_manual=True)
    
    def get_report_html(self, report_id: int, user_id: int) -> Optional[str]:
        """Get full HTML of a stored report (for in-app viewing)"""
        report = self.db.query(FRNReportHistory).filter(
            FRNReportHistory.id == report_id,
            FRNReportHistory.user_id == user_id
        ).first()
        
        if not report:
            return None
        
        # Mark as viewed
        if not report.viewed_at:
            report.viewed_at = datetime.utcnow()
            self.db.commit()
        
        return report.html_content
    
    # ==================== BATCH PROCESSING ====================
    
    def _process_user_batch(self, user: User, watches: List[FRNWatch], is_manual: bool = False) -> Dict[str, Any]:
        """
        Process a batch of watches for a single user.
        Generates ONE consolidated report, ONE email, ONE SMS.
        Delta-only: only reports changes since the last sent report.
        First run: records initial snapshot without dumping all FRNs.
        """
        try:
            from utils.usac_client import USACDataClient
            client = USACDataClient()
            
            watch_sections = []
            total_frn_count = 0
            total_changes = 0
            all_funded = 0
            all_denied = 0
            all_pending = 0
            all_amount = 0
            any_email_needed = False
            any_sms_needed = False
            watch_errors = 0
            any_first_snapshot = False
            
            for watch in watches:
                try:
                    print(f"[SNAPSHOT] Loading watch {watch.id}: last_snapshot={'EMPTY' if not watch.last_snapshot else f'{len(watch.last_snapshot)} entries'}")
                    # Fetch data
                    frn_data = self._fetch_frn_data(watch, user, client)
                    filtered = self._apply_filters(frn_data, watch)
                    
                    # Detect if this is the first snapshot (no previous data)
                    is_first_snapshot = not watch.last_snapshot
                    
                    # Detect real changes (returns [] on first run)
                    changes = self._detect_changes(filtered, watch.last_snapshot or {})
                    
                    if is_first_snapshot:
                        any_first_snapshot = True
                    
                    # Calculate stats
                    funded = sum(1 for f in filtered if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower())
                    denied = sum(1 for f in filtered if "denied" in (f.get("status") or "").lower())
                    pending = sum(1 for f in filtered if "pending" in (f.get("status") or "").lower())
                    amount = sum(float(f.get("commitment_amount", 0) or 0) for f in filtered)
                    
                    # Build new snapshot for change detection on next run (multi-field)
                    new_snapshot = {}
                    for f in filtered:
                        if f.get("frn"):
                            new_snapshot[f["frn"]] = {
                                "status": f.get("status", ""),
                                "pending_reason": f.get("pending_reason", ""),
                                "disbursed_amount": float(f.get("disbursed_amount", 0) or 0),
                                "f486_status": f.get("f486_status", f.get("f486_case_status", "")),
                                "wave_number": f.get("wave_number", f.get("wave_sequence_number", "")),
                                "invoicing_mode": f.get("invoicing_mode", ""),
                                "updated_at": f.get("updated_at", ""),
                                "commitment_amount": float(f.get("commitment_amount", 0) or 0),
                            }
                    print(f"[SNAPSHOT] Built new_snapshot for watch {watch.id}: {len(new_snapshot)} entries, {len(json.dumps(new_snapshot))} bytes")
                    
                    watch_sections.append({
                        "watch": watch,
                        "frns": filtered,
                        "changes": changes,
                        "funded": funded,
                        "denied": denied,
                        "pending": pending,
                        "amount": amount,
                        "is_first_snapshot": is_first_snapshot,
                        "new_snapshot": new_snapshot,
                    })
                    
                    total_frn_count += len(filtered)
                    total_changes += len(changes)
                    all_funded += funded
                    all_denied += denied
                    all_pending += pending
                    all_amount += amount
                    
                    if watch.delivery_mode != DeliveryMode.IN_APP_ONLY.value:
                        any_email_needed = True
                    if watch.notify_sms:
                        any_sms_needed = True
                    
                    # Update watch state — always save snapshot for next comparison
                    watch.last_sent_at = datetime.utcnow()
                    watch.next_send_at = watch.calculate_next_send()
                    watch.send_count = (watch.send_count or 0) + 1
                    watch.last_error = None
                    watch.last_snapshot = new_snapshot
                    flag_modified(watch, "last_snapshot")
                    
                except Exception as e:
                    logger.error(f"Error processing watch {watch.id}: {e}")
                    watch.last_error = str(e)
                    watch.next_send_at = watch.calculate_next_send()  # Always advance schedule even on error
                    watch_errors += 1
            
            if not watch_sections:
                self.db.commit()
                return {"success": False, "message": "No data for any watch", "frn_count": 0, "errors": watch_errors}
            
            # Generate AI summary if there are real changes
            all_changes = []
            for s in watch_sections:
                all_changes.extend(s["changes"])
            
            ai_summary = ""
            if all_changes:
                ai_summary = self._generate_ai_summary(all_changes, user, watch_sections)
            
            # Bridge FRN Watch changes to Alert system — per-FRN individual alerts
            if all_changes:
                try:
                    from .alert_service import AlertService
                    alert_svc = AlertService(self.db)
                    
                    # Flood guard: if > 100 changes, only create individual alerts
                    # for denials and funded changes; summarize the rest
                    FLOOD_THRESHOLD = 100
                    if len(all_changes) > FLOOD_THRESHOLD:
                        priority_changes = [
                            c for c in all_changes
                            if "denied" in (c.get("new_status", "") or "").lower()
                            or "funded" in (c.get("new_status", "") or "").lower()
                            or "committed" in (c.get("new_status", "") or "").lower()
                        ]
                        low_priority = [c for c in all_changes if c not in priority_changes]
                        
                        # Create individual alerts for priority changes
                        self._create_per_frn_alerts(alert_svc, user.id, priority_changes)
                        
                        # Create ONE summary for the rest
                        if low_priority:
                            alert_svc.create_alert(
                                user_id=user.id,
                                alert_type=AlertType.FRN_STATUS_CHANGE,
                                priority=AlertPriority.LOW,
                                title=f"{len(low_priority)} Additional FRN Status Changes",
                                message=f"{len(low_priority)} low-priority FRN status changes detected. Check your FRN Status tab for details.",
                                entity_type="frn_report",
                                metadata={
                                    "change_count": len(low_priority),
                                    "changes": [
                                        {"frn": c.get("frn", ""), "entity": c.get("entity_name", ""),
                                         "old": c.get("old_status", ""), "new": c.get("new_status", ""),
                                         "amt": float(c.get("amount", 0) or 0)}
                                        for c in low_priority[:50]
                                    ],
                                },
                                send_email=False
                            )
                    else:
                        # Normal flow: create individual alerts for ALL changes
                        self._create_per_frn_alerts(alert_svc, user.id, all_changes)
                    
                    logger.info(f"Created per-FRN alerts for user {user.id}: {len(all_changes)} total changes")
                except Exception as e:
                    logger.error(f"Failed to create alert records for FRN Watch changes: {e}")
            
            # Check deadlines for all current FRNs
            for section in watch_sections:
                try:
                    self._check_deadlines(user, section["frns"], section["watch"])
                except Exception as e:
                    logger.error(f"Failed to check deadlines for watch {section['watch'].id}: {e}")
            
            # Generate HTML (always — needed for in-app storage)
            html = self._generate_consolidated_html(
                user, watch_sections,
                ai_summary=ai_summary,
                is_first_snapshot=any_first_snapshot,
                total_changes=total_changes
            )
            
            # Determine primary recipient email (from the first watch that wants email)
            recipient_email = None
            cc_set = set()
            for section in watch_sections:
                w = section["watch"]
                if w.delivery_mode != DeliveryMode.IN_APP_ONLY.value:
                    if not recipient_email:
                        recipient_email = w.recipient_email
                    elif w.recipient_email != recipient_email:
                        cc_set.add(w.recipient_email)
                    for cc in (w.cc_emails or []):
                        cc_set.add(cc)
            
            # Store in history
            report_name = self._generate_report_name(watches)
            history = FRNReportHistory(
                user_id=user.id,
                report_name=report_name,
                watch_ids=[w.id for w in watches],
                watch_names=[w.name for w in watches],
                html_content=html,
                total_frns=total_frn_count,
                funded_count=all_funded,
                denied_count=all_denied,
                pending_count=all_pending,
                total_amount=int(all_amount * 100),  # Store as cents
                changes_detected=total_changes,
                delivery_modes=list({s["watch"].delivery_mode for s in watch_sections}),
                recipient_email=recipient_email or user.email,
            )
            self.db.add(history)
            self.db.flush()  # Get the ID
            
            email_sent = False
            sms_sent = False
            
            # Send consolidated email if any watch wants it
            if any_email_needed and recipient_email:
                try:
                    self._send_consolidated_email(
                        user, watch_sections, html, total_frn_count,
                        recipient_email, list(cc_set), history.id
                    )
                    history.email_sent = True
                    email_sent = True
                except Exception as e:
                    logger.error(f"Failed to send consolidated email for user {user.id}: {e}")
            
            # Send SMS notification if any watch opted in
            if any_sms_needed:
                try:
                    sms_sent = self._send_sms_notification(user, watches, history.id, total_frn_count)
                    history.sms_sent = sms_sent
                except Exception as e:
                    logger.error(f"Failed to send SMS for user {user.id}: {e}")
            
            print(f"[SNAPSHOT] About to commit. Session dirty: {self.db.dirty}, new: {self.db.new}")
            self.db.commit()
            
            # Force-persist snapshots via raw SQL to bypass ORM JSON column issues
            # This runs ALWAYS (not just as fallback) for maximum reliability
            for section in watch_sections:
                w = section["watch"]
                snap = section.get("new_snapshot", {})
                if not snap:
                    continue
                
                snap_json = json.dumps(snap)
                try:
                    from ..core.database import engine
                    with engine.connect() as conn:
                        conn.execute(
                            text("UPDATE frn_watches SET last_snapshot = :snap WHERE id = :wid"),
                            {"snap": snap_json, "wid": w.id}
                        )
                        conn.commit()
                    print(f"[SNAPSHOT] watch_id={w.id}: raw SQL saved {len(snap_json)} bytes ({len(snap)} entries)")
                except Exception as e2:
                    print(f"[SNAPSHOT] Raw SQL save FAILED for watch {w.id}: {e2}")
            
            return {
                "success": True,
                "message": f"Report generated with {total_frn_count} FRNs across {len(watch_sections)} monitors",
                "frn_count": total_frn_count,
                "changes_detected": total_changes,
                "email_sent": email_sent,
                "sms_sent": sms_sent,
                "report_id": history.id,
                "errors": watch_errors,
            }
            
        except Exception as e:
            logger.error(f"Error in batch processing for user {user.id}: {e}")
            self.db.commit()
            return {"success": False, "message": str(e), "frn_count": 0, "errors": len(watches)}
    
    # ==================== DATA FETCHING ====================
    
    def _fetch_frn_data(self, watch: FRNWatch, user: User, client) -> List[Dict]:
        """Fetch FRN data based on watch type"""
        if watch.watch_type == WatchType.FRN.value:
            all_frns = self._fetch_portfolio_frns(user, client, watch.funding_year)
            return [f for f in all_frns if f.get("frn") == watch.target_id]
        
        elif watch.watch_type == WatchType.BEN.value:
            result = client.get_frn_status_by_ben(
                watch.target_id,
                year=watch.funding_year
            )
            if result.get("success"):
                return result.get("frns", [])
            return []
        
        elif watch.watch_type == WatchType.PORTFOLIO.value:
            return self._fetch_portfolio_frns(user, client, watch.funding_year)
        
        return []
    
    def _fetch_portfolio_frns(self, user: User, client, funding_year: int = None) -> List[Dict]:
        """Fetch all FRNs across a user's portfolio.
        
        If no funding_year is specified, defaults to current + previous year
        to avoid pulling irrelevant historical data.
        """
        all_frns = []
        
        # Default to current + previous funding year if not specified
        if funding_year is None:
            current_year = datetime.utcnow().year
            years_to_fetch = [current_year, current_year - 1]
        else:
            years_to_fetch = [funding_year]
        
        profile = self.db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user.id
        ).first()
        
        if profile:
            schools = self.db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()
            bens = [s.ben for s in schools if s.ben]
            
            if bens:
                for yr in years_to_fetch:
                    result = client.get_frn_status_batch(bens, year=yr)
                    if result.get("success"):
                        for ben, ben_data in result.get("results", {}).items():
                            for frn in ben_data.get("frns", []):
                                frn["entity_name"] = ben_data.get("entity_name", f"BEN {ben}")
                                frn["ben"] = str(ben)
                                all_frns.append(frn)
        
        vendor_profile = self.db.query(VendorProfile).filter(
            VendorProfile.user_id == user.id
        ).first()
        
        if vendor_profile and vendor_profile.spin:
            for yr in years_to_fetch:
                result = client.get_frn_status_by_spin(vendor_profile.spin, year=yr)
                if result.get("success"):
                    for frn in result.get("frns", []):
                        all_frns.append(frn)
        
        # Deduplicate by FRN number (same FRN can appear from both BEN and SPIN queries)
        seen = set()
        unique_frns = []
        for frn in all_frns:
            frn_num = frn.get("frn", "")
            if frn_num and frn_num not in seen:
                seen.add(frn_num)
                unique_frns.append(frn)
        
        return unique_frns
    
    def _apply_filters(self, frns: List[Dict], watch: FRNWatch) -> List[Dict]:
        """Apply watch filters to FRN list"""
        filtered = []
        for frn in frns:
            status = (frn.get("status") or "").lower()
            if "funded" in status or "committed" in status:
                if not watch.include_funded:
                    continue
            elif "denied" in status:
                if not watch.include_denied:
                    continue
            elif "pending" in status:
                if not watch.include_pending:
                    continue
            if watch.status_filter and watch.status_filter.lower() not in status:
                continue
            
            filtered.append(frn)
        return filtered
    
    def _detect_changes(self, current_frns: List[Dict], last_snapshot: Dict) -> List[Dict]:
        """Compare current FRNs with last snapshot to detect changes.
        
        Deduplicates by FRN number first to avoid false changes from
        duplicate entries (e.g. same FRN from BEN + SPIN queries).
        Returns enriched change dicts with full USAC record fields.
        
        Detects: status changes, substatus/pending_reason changes,
        disbursement increases, and Form 486 status changes.
        Backward-compatible with old string-only snapshots.
        """
        changes = []
        if not last_snapshot:
            return []
        
        # Build deduplicated map: frn_number -> frn dict (first occurrence wins)
        current_map = {}
        for frn in current_frns:
            frn_num = frn.get("frn", "")
            if frn_num and frn_num not in current_map:
                current_map[frn_num] = frn
        
        for frn_num, frn in current_map.items():
            old_data = last_snapshot.get(frn_num)
            if old_data is None:
                # New FRN not in previous snapshot
                changes.append(self._build_enriched_change(frn_num, frn, "[New]", frn.get("status", ""), change_type="new_frn"))
                continue
            
            # Backward compat: old snapshots stored just a status string
            if isinstance(old_data, str):
                old_data = {"status": old_data, "pending_reason": "", "disbursed_amount": 0, "f486_status": "", "wave_number": "", "invoicing_mode": ""}
            
            # Fast-skip: if updated_at timestamps match, nothing changed at USAC
            current_updated = frn.get("updated_at", "")
            old_updated = old_data.get("updated_at", "")
            if current_updated and old_updated and current_updated == old_updated:
                continue
            
            current_status = frn.get("status", "")
            old_status = old_data.get("status", "")
            current_pending = frn.get("pending_reason", "")
            old_pending = old_data.get("pending_reason", "")
            current_disbursed = float(frn.get("disbursed_amount", 0) or 0)
            old_disbursed = float(old_data.get("disbursed_amount", 0) or 0)
            current_f486 = frn.get("f486_status", frn.get("f486_case_status", ""))
            old_f486 = old_data.get("f486_status", "")
            
            # Status change (highest priority)
            if old_status != current_status:
                changes.append(self._build_enriched_change(frn_num, frn, old_status, current_status, change_type="status_change"))
            # SubStatus/pending_reason change
            elif old_pending != current_pending and current_pending:
                changes.append(self._build_enriched_change(frn_num, frn, old_pending, current_pending, change_type="substatus_change"))
            # Disbursement increase
            elif current_disbursed > old_disbursed and current_disbursed > 0:
                change = self._build_enriched_change(frn_num, frn, f"${old_disbursed:,.2f}", f"${current_disbursed:,.2f}", change_type="disbursement")
                change["disbursement_delta"] = current_disbursed - old_disbursed
                changes.append(change)
            # Form 486 status change
            elif old_f486 != current_f486 and current_f486:
                changes.append(self._build_enriched_change(frn_num, frn, old_f486, current_f486, change_type="f486_change"))
        
        return changes
    
    def _build_enriched_change(self, frn_num: str, frn: Dict, old_status: str, new_status: str, change_type: str = "status_change") -> Dict:
        """Build a change dict enriched with full USAC record fields."""
        return {
            "frn": frn_num,
            "change_type": change_type,
            "entity_name": frn.get("entity_name", ""),
            "old_status": old_status,
            "new_status": new_status,
            "amount": float(frn.get("commitment_amount", 0) or 0),
            "ben": frn.get("ben", ""),
            "funding_year": frn.get("funding_year", ""),
            "fcdl_comment": frn.get("fcdl_comment", ""),
            "fcdl_date": frn.get("fcdl_date", ""),
            "pending_reason": frn.get("pending_reason", ""),
            "service_type": frn.get("service_type", ""),
            "spin_name": frn.get("spin_name", ""),
            "last_date_to_invoice": frn.get("last_invoice_date", frn.get("last_date_to_invoice", "")),
            "service_delivery_deadline": frn.get("service_end", frn.get("service_delivery_deadline", "")),
            "discount_rate": frn.get("discount_rate", ""),
            "disbursed_amount": float(frn.get("disbursed_amount", 0) or 0),
            "application_number": frn.get("application_number", ""),
            "wave_number": frn.get("wave_number", frn.get("wave_sequence_number", "")),
            "invoicing_mode": frn.get("invoicing_mode", ""),
            "updated_at": frn.get("updated_at", ""),
        }
    
    # ==================== PER-FRN ALERT CREATION ====================
    
    def _create_per_frn_alerts(self, alert_svc, user_id: int, changes: List[Dict]):
        """Create individual per-FRN alerts for each change."""
        for change in changes:
            change_type = change.get("change_type", "status_change")
            is_denial = "denied" in (change.get("new_status", "") or "").lower()
            is_funded = "funded" in (change.get("new_status", "") or "").lower() or "committed" in (change.get("new_status", "") or "").lower()
            
            if is_denial:
                alert_type = AlertType.NEW_DENIAL
                priority = AlertPriority.HIGH
            elif is_funded:
                alert_type = AlertType.FUNDING_APPROVED
                priority = AlertPriority.MEDIUM
            elif change_type == "disbursement":
                alert_type = AlertType.DISBURSEMENT_RECEIVED
                priority = AlertPriority.MEDIUM
            elif change_type == "substatus_change":
                alert_type = AlertType.SUBSTATUS_CHANGE
                new_sub = (change.get("new_status", "") or "").lower()
                urgent_patterns = ("15 day", "15-day", "letter of inquiry", "pia", "reminder notice", "outstanding", "response required")
                if any(p in new_sub for p in urgent_patterns):
                    priority = AlertPriority.HIGH
                else:
                    priority = AlertPriority.MEDIUM
            elif change_type == "f486_change":
                alert_type = AlertType.SUBSTATUS_CHANGE
                priority = AlertPriority.LOW
            else:
                alert_type = AlertType.FRN_STATUS_CHANGE
                priority = AlertPriority.MEDIUM
            
            # Build contextual title and message based on change type
            if change_type == "disbursement":
                title = f"FRN {change['frn']} - Disbursement: {change.get('new_status', '')}"
                message = (
                    f"{change.get('entity_name', 'Unknown')} (BEN {change.get('ben', 'N/A')}): "
                    f"Disbursement changed from {change.get('old_status', '?')} to {change.get('new_status', '?')}. "
                    f"Delta: ${float(change.get('disbursement_delta', 0)):,.2f}"
                )
            elif change_type == "substatus_change":
                title = f"FRN {change['frn']} - SubStatus: {change.get('new_status', 'Unknown')}"
                message = (
                    f"{change.get('entity_name', 'Unknown')} (BEN {change.get('ben', 'N/A')}): "
                    f"Pending reason changed from '{change.get('old_status', '?')}' to '{change.get('new_status', '?')}'. "
                    f"Amount: ${float(change.get('amount', 0)):,.2f}"
                )
            elif change_type == "f486_change":
                title = f"FRN {change['frn']} - Form 486: {change.get('new_status', 'Unknown')}"
                message = (
                    f"{change.get('entity_name', 'Unknown')} (BEN {change.get('ben', 'N/A')}): "
                    f"Form 486 status changed from '{change.get('old_status', '?')}' to '{change.get('new_status', '?')}'. "
                    f"Amount: ${float(change.get('amount', 0)):,.2f}"
                )
            else:
                title = f"FRN {change['frn']} - {change.get('new_status', 'Unknown')}"
                message = (
                    f"{change.get('entity_name', 'Unknown')} (BEN {change.get('ben', 'N/A')}): "
                    f"Status changed from {change.get('old_status', '?')} to {change.get('new_status', '?')}. "
                    f"Amount: ${float(change.get('amount', 0)):,.2f}"
                )
            
            alert_svc.create_alert(
                user_id=user_id,
                alert_type=alert_type,
                priority=priority,
                title=title,
                message=message,
                entity_type="frn",
                entity_id=change["frn"],
                entity_name=change.get("entity_name", ""),
                metadata={
                    "frn": change["frn"],
                    "change_type": change.get("change_type", "status_change"),
                    "ben": change.get("ben", ""),
                    "organization_name": change.get("entity_name", ""),
                    "old_status": change.get("old_status", ""),
                    "new_status": change.get("new_status", ""),
                    "amount": float(change.get("amount", 0) or 0),
                    "funding_year": change.get("funding_year", ""),
                    "fcdl_comment": change.get("fcdl_comment", ""),
                    "fcdl_date": change.get("fcdl_date", ""),
                    "pending_reason": change.get("pending_reason", ""),
                    "service_type": change.get("service_type", ""),
                    "spin_name": change.get("spin_name", ""),
                    "last_date_to_invoice": change.get("last_date_to_invoice", ""),
                    "service_delivery_deadline": change.get("service_delivery_deadline", ""),
                    "disbursement_delta": float(change.get("disbursement_delta", 0) or 0),
                },
                send_email=False  # Never send individual emails; daily digest handles email
            )
    
    # ==================== DEADLINE DETECTION ====================
    
    def _check_deadlines(self, user: User, frns: List[Dict], watch: FRNWatch):
        """Scan all current FRNs for upcoming deadlines and create alerts.
        
        Tracks sent deadline alerts via watch.last_snapshot to prevent duplicates.
        Uses keys like '{frn}_{type}_{days}' in a 'deadline_alerts_sent' dict.
        """
        from .alert_service import AlertService
        alert_svc = AlertService(self.db)
        now = datetime.utcnow()
        
        # Load previously sent deadline alerts from snapshot metadata
        snapshot = watch.last_snapshot or {}
        sent_deadlines = snapshot.get("__deadline_alerts_sent__", {}) if isinstance(snapshot, dict) else {}
        new_sent = dict(sent_deadlines)  # copy for updates
        
        INVOICE_ALERT_DAYS = [30, 14, 7, 3]
        APPEAL_ALERT_DAYS = [30, 14, 7, 3]
        SERVICE_ALERT_DAYS = [60, 30, 14]
        F486_ALERT_DAYS = [90, 60, 30, 14]
        DISBURSEMENT_WARNING_DAYS = [30, 7]
        
        def _urgency(days_remaining: int) -> str:
            if days_remaining <= 7:
                return "critical"
            elif days_remaining <= 14:
                return "high"
            elif days_remaining <= 30:
                return "medium"
            return "low"
        
        def _check_date(date_str: str, frn_dict: Dict, deadline_type: str, alert_type, thresholds: list):
            if not date_str:
                return
            try:
                deadline = datetime.fromisoformat(date_str.replace("Z", "+00:00").split("T")[0])
            except (ValueError, TypeError):
                return
            days_rem = (deadline - now).days
            if days_rem <= 0:
                return  # expired, too late to alert
            
            frn_num = frn_dict.get("frn", "")
            for threshold in thresholds:
                if days_rem <= threshold:
                    dedup_key = f"{frn_num}_{deadline_type}_{threshold}"
                    if dedup_key in sent_deadlines:
                        continue  # already sent this alert
                    
                    urgency = _urgency(days_rem)
                    priority_map = {
                        "critical": AlertPriority.CRITICAL,
                        "high": AlertPriority.HIGH,
                        "medium": AlertPriority.MEDIUM,
                        "low": AlertPriority.LOW,
                    }
                    
                    type_labels = {
                        "invoice": "Invoicing Deadline",
                        "appeal": "Appeal Deadline",
                        "service": "Service Delivery Deadline",
                        "f486": "Form 486 Filing Deadline",
                        "no_disbursement": "No Disbursements Warning",
                    }
                    
                    alert_svc.create_alert(
                        user_id=user.id,
                        alert_type=alert_type,
                        priority=priority_map.get(urgency, AlertPriority.MEDIUM),
                        title=f"FRN {frn_num} - {type_labels.get(deadline_type, 'Deadline')} in {days_rem} days",
                        message=(
                            f"{frn_dict.get('entity_name', 'Unknown')} (BEN {frn_dict.get('ben', 'N/A')}): "
                            f"{type_labels.get(deadline_type, 'Deadline')} is {deadline.strftime('%Y-%m-%d')} "
                            f"({days_rem} days remaining). Status: {frn_dict.get('status', 'Unknown')}."
                        ),
                        entity_type="frn",
                        entity_id=frn_num,
                        entity_name=frn_dict.get("entity_name", ""),
                        metadata={
                            "frn": frn_num,
                            "ben": frn_dict.get("ben", ""),
                            "organization_name": frn_dict.get("entity_name", ""),
                            "deadline_type": deadline_type,
                            "deadline_date": deadline.strftime("%Y-%m-%d"),
                            "days_remaining": days_rem,
                            "urgency": urgency,
                            "status": frn_dict.get("status", ""),
                            "amount": float(frn_dict.get("commitment_amount", 0) or 0),
                            "funding_year": frn_dict.get("funding_year", ""),
                        },
                        send_email=False,
                    )
                    new_sent[dedup_key] = now.isoformat()
                    break  # only create alert for the most urgent matching threshold
        
        for frn in frns:
            status = (frn.get("status") or "").lower()
            
            # Invoicing deadline
            invoice_date = frn.get("last_invoice_date") or frn.get("last_date_to_invoice", "")
            _check_date(invoice_date, frn, "invoice", AlertType.DEADLINE_APPROACHING, INVOICE_ALERT_DAYS)
            
            # Appeal deadline (denied FRNs only)
            if "denied" in status:
                fcdl_date_str = frn.get("fcdl_date", "")
                if fcdl_date_str:
                    try:
                        fcdl_dt = datetime.fromisoformat(fcdl_date_str.replace("Z", "+00:00").split("T")[0])
                        appeal_deadline = (fcdl_dt + timedelta(days=60)).strftime("%Y-%m-%d")
                        _check_date(appeal_deadline, frn, "appeal", AlertType.APPEAL_DEADLINE, APPEAL_ALERT_DAYS)
                    except (ValueError, TypeError):
                        pass
            
            # Service delivery deadline
            svc_deadline = frn.get("service_end") or frn.get("service_delivery_deadline", "")
            _check_date(svc_deadline, frn, "service", AlertType.DEADLINE_APPROACHING, SERVICE_ALERT_DAYS)
            
            # Form 486 deadline (funded FRNs where f486 is NOT Approved/Filed)
            f486_status = (frn.get("f486_status") or frn.get("f486_case_status") or "").lower()
            if ("funded" in status or "committed" in status) and f486_status not in ("approved", "filed"):
                fcdl_str = frn.get("fcdl_date") or frn.get("fcdl_letter_date", "")
                svc_start_str = frn.get("service_start") or frn.get("service_start_date", "")
                try:
                    fcdl_dt = datetime.fromisoformat(fcdl_str.replace("Z", "+00:00").split("T")[0]) if fcdl_str else None
                except (ValueError, TypeError):
                    fcdl_dt = None
                try:
                    svc_start_dt = datetime.fromisoformat(svc_start_str.replace("Z", "+00:00").split("T")[0]) if svc_start_str else None
                except (ValueError, TypeError):
                    svc_start_dt = None
                
                base_dates = [d for d in [fcdl_dt, svc_start_dt] if d is not None]
                if base_dates:
                    f486_deadline = max(base_dates) + timedelta(days=120)
                    _check_date(f486_deadline.strftime("%Y-%m-%d"), frn, "f486", AlertType.FORM_486_DUE, F486_ALERT_DAYS)
            
            # No-disbursement warning (funded FRNs with $0 disbursed near invoice deadline)
            if "funded" in status or "committed" in status:
                disbursed = float(frn.get("disbursed_amount") or frn.get("total_authorized_disbursement") or 0)
                if disbursed == 0:
                    inv_date_str = frn.get("last_invoice_date") or frn.get("last_date_to_invoice", "")
                    if inv_date_str:
                        try:
                            inv_deadline = datetime.fromisoformat(inv_date_str.replace("Z", "+00:00").split("T")[0])
                            inv_days_rem = (inv_deadline - now).days
                            if 0 < inv_days_rem <= DISBURSEMENT_WARNING_DAYS[0]:
                                for threshold in DISBURSEMENT_WARNING_DAYS:
                                    if inv_days_rem <= threshold:
                                        frn_num = frn.get("frn", "")
                                        dedup_key = f"{frn_num}_no_disbursement_{threshold}"
                                        if dedup_key in sent_deadlines:
                                            continue
                                        urgency = _urgency(inv_days_rem)
                                        priority_map = {
                                            "critical": AlertPriority.CRITICAL,
                                            "high": AlertPriority.HIGH,
                                            "medium": AlertPriority.MEDIUM,
                                            "low": AlertPriority.LOW,
                                        }
                                        alert_svc.create_alert(
                                            user_id=user.id,
                                            alert_type=AlertType.NO_DISBURSEMENT_WARNING,
                                            priority=priority_map.get(urgency, AlertPriority.HIGH),
                                            title=f"FRN {frn_num} - No Disbursements with {inv_days_rem} days until invoicing deadline",
                                            message=(
                                                f"{frn.get('entity_name', 'Unknown')} (BEN {frn.get('ben', 'N/A')}): "
                                                f"FRN {frn_num} has NO disbursements with only {inv_days_rem} days until "
                                                f"invoicing deadline ({inv_deadline.strftime('%Y-%m-%d')}). "
                                                f"Amount: ${float(frn.get('commitment_amount', 0) or 0):,.2f}"
                                            ),
                                            entity_type="frn",
                                            entity_id=frn_num,
                                            entity_name=frn.get("entity_name", ""),
                                            metadata={
                                                "frn": frn_num,
                                                "ben": frn.get("ben", ""),
                                                "organization_name": frn.get("entity_name", ""),
                                                "deadline_type": "no_disbursement",
                                                "deadline_date": inv_deadline.strftime("%Y-%m-%d"),
                                                "days_remaining": inv_days_rem,
                                                "urgency": urgency,
                                                "status": frn.get("status", ""),
                                                "amount": float(frn.get("commitment_amount", 0) or 0),
                                                "funding_year": frn.get("funding_year", ""),
                                                "disbursed_amount": 0,
                                            },
                                            send_email=False,
                                        )
                                        new_sent[dedup_key] = now.isoformat()
                                        break  # only create alert for the most urgent threshold
                        except (ValueError, TypeError):
                            pass
        
        # Persist updated deadline tracking
        if new_sent != sent_deadlines:
            if isinstance(watch.last_snapshot, dict):
                watch.last_snapshot["__deadline_alerts_sent__"] = new_sent
                flag_modified(watch, "last_snapshot")
    
    # ==================== REPORT NAME ====================
    
    def _generate_report_name(self, watches: List[FRNWatch]) -> str:
        """Generate a human-readable report name"""
        now = datetime.utcnow()
        date_str = now.strftime('%b %d, %Y')
        
        if len(watches) == 1:
            return f"{watches[0].name} - {date_str}"
        else:
            return f"Consolidated Report ({len(watches)} monitors) - {date_str}"
    
    # ==================== HTML GENERATION ====================
    
    def _generate_consolidated_html(self, user: User, watch_sections: List[Dict],
                                      ai_summary: str = "", is_first_snapshot: bool = False,
                                      total_changes: int = 0) -> str:
        """Generate ONE HTML email with sections for each watch — delta-focused"""
        now = datetime.utcnow()
        
        # Grand totals
        grand_funded = sum(s["funded"] for s in watch_sections)
        grand_denied = sum(s["denied"] for s in watch_sections)
        grand_pending = sum(s["pending"] for s in watch_sections)
        grand_total = sum(len(s["frns"]) for s in watch_sections)
        grand_amount = sum(s["amount"] for s in watch_sections)
        grand_changes = sum(len(s["changes"]) for s in watch_sections)
        
        multi = len(watch_sections) > 1
        
        # Determine header subtitle based on report type
        if is_first_snapshot and grand_changes == 0:
            header_subtitle = f"Initial snapshot recorded | {grand_total} FRNs tracked"
        elif grand_changes > 0:
            header_subtitle = f"{grand_changes} change{'s' if grand_changes != 1 else ''} detected"
        else:
            header_subtitle = "No changes since last report"
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FRN Status Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #0f766e, #0d9488); padding: 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FRN Status Report</h1>
                            <p style="color: #99f6e4; margin: 8px 0 0 0; font-size: 14px;">{now.strftime('%B %d, %Y')}</p>
                            <p style="color: #99f6e4; margin: 4px 0 0 0; font-size: 12px;">{header_subtitle}</p>
                        </td>
                    </tr>
"""
        
        # First snapshot message
        if is_first_snapshot and grand_changes == 0:
            html += f"""
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <div style="background-color: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; padding: 20px; text-align: center;">
                                <p style="color: #0369a1; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">Initial Snapshot Recorded</p>
                                <p style="color: #475569; font-size: 13px; margin: 0;">We are now tracking <strong>{grand_total} FRNs</strong> across {len(watch_sections)} monitor{'s' if multi else ''}.</p>
                                <p style="color: #475569; font-size: 13px; margin: 8px 0 0 0;">Future reports will only show <strong>changes</strong> to FRN statuses, funding amounts, and new or removed FRNs.</p>
                                <p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0;">Portfolio snapshot: {grand_funded} funded | {grand_pending} pending | {grand_denied} denied | Total: ${grand_amount:,.0f}</p>
                            </div>
                        </td>
                    </tr>
"""
        
        # No changes message
        elif grand_changes == 0:
            html += f"""
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <div style="background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; padding: 20px; text-align: center;">
                                <p style="color: #15803d; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">All Clear — No Changes</p>
                                <p style="color: #475569; font-size: 13px; margin: 0;">No FRN status changes detected since your last report.</p>
                                <p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0;">Monitoring {grand_total} FRNs: {grand_funded} funded | {grand_pending} pending | {grand_denied} denied</p>
                            </div>
                        </td>
                    </tr>
"""
        
        # Changes detected — show AI summary + stats + change details
        else:
            # AI Summary block
            if ai_summary:
                html += f"""
                    <tr>
                        <td style="padding: 24px 30px 8px 30px;">
                            <div style="background-color: #faf5ff; border-radius: 8px; border-left: 4px solid #7c3aed; padding: 16px;">
                                <p style="color: #6d28d9; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0;">AI Summary</p>
                                <p style="color: #334155; font-size: 13px; line-height: 1.5; margin: 0;">{ai_summary}</p>
                            </div>
                        </td>
                    </tr>
"""
            
            # Compact stats bar
            html += f"""
                    <tr>
                        <td style="padding: 16px 30px 0 30px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td width="24%" style="padding: 10px; text-align: center; background-color: #f0fdf4; border-radius: 8px;">
                                        <div style="color: #15803d; font-size: 26px; font-weight: 700;">{grand_funded}</div>
                                        <div style="color: #16a34a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Funded</div>
                                    </td>
                                    <td width="2%"></td>
                                    <td width="24%" style="padding: 10px; text-align: center; background-color: #fffbeb; border-radius: 8px;">
                                        <div style="color: #a16207; font-size: 26px; font-weight: 700;">{grand_pending}</div>
                                        <div style="color: #ca8a04; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Pending</div>
                                    </td>
                                    <td width="2%"></td>
                                    <td width="24%" style="padding: 10px; text-align: center; background-color: #fef2f2; border-radius: 8px;">
                                        <div style="color: #b91c1c; font-size: 26px; font-weight: 700;">{grand_denied}</div>
                                        <div style="color: #dc2626; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Denied</div>
                                    </td>
                                    <td width="2%"></td>
                                    <td width="24%" style="padding: 10px; text-align: center; background-color: #fdf2f8; border-radius: 8px;">
                                        <div style="color: #be185d; font-size: 26px; font-weight: 700;">{grand_changes}</div>
                                        <div style="color: #db2777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Changes</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
"""
            
            # Per-watch change sections
            for section in watch_sections:
                watch = section["watch"]
                frns = section["frns"]
                changes = section["changes"]
                is_first = section.get("is_first_snapshot", False)
                
                if watch.delivery_mode == DeliveryMode.IN_APP_ONLY.value:
                    html += self._generate_inapp_only_section_html(watch, frns)
                elif is_first:
                    html += self._generate_first_snapshot_section_html(watch, frns)
                elif changes:
                    html += self._generate_watch_section_html(watch, frns, changes)
                else:
                    html += self._generate_no_changes_section_html(watch, frns)

        # Portfolio summary — only for reports with changes (skip first-snapshot and no-changes)
        if grand_changes > 0 and not (is_first_snapshot and grand_changes == 0):
            html += self._generate_portfolio_summary_html(watch_sections)

        # View in dashboard link — deep-link to first changed FRN if available
        first_frn_number = None
        for _section in watch_sections:
            for _change in _section.get("changes", []):
                if _change.get("frn"):
                    first_frn_number = _change["frn"]
                    break
            if first_frn_number:
                break
        cta_url = f"https://skyrate.ai/consultant?tab=frn-status&frn={first_frn_number}" if first_frn_number else "https://skyrate.ai/consultant?tab=frn-status"
        html += f"""
                    <tr>
                        <td style="padding: 20px 30px; text-align: center;">
                            <a href="{cta_url}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0f766e, #0d9488); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">View FRN Status Details</a>
                        </td>
                    </tr>
"""
        
        # Footer
        watch_names = ", ".join(s["watch"].name for s in watch_sections)
        html += f"""
                    <tr>
                        <td style="padding: 20px 30px; border-top: 1px solid #e2e8f0;">
                            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
                                This report was generated by <a href="https://skyrate.ai" style="color: #0d9488;">SkyRate AI</a>
                                <br>Monitors: {watch_names}
                                <br><br>
                                To manage your report monitors, visit your <a href="https://skyrate.ai/consultant?tab=frn-status" style="color: #0d9488;">FRN Status Dashboard</a>.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
        return html
    
    def _generate_watch_section_html(self, watch: FRNWatch, frns: List[Dict], changes: List[Dict]) -> str:
        """Generate changes-focused section for a watch — card-based layout grouped by type"""
        html = f"""
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <div style="background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #be185d; padding: 16px; margin-bottom: 16px;">
                                <h2 style="color: #0f766e; font-size: 16px; margin: 0;">{watch.name}</h2>
                                <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">
                                    {len(changes)} change{'s' if len(changes) != 1 else ''} detected | {len(frns)} FRNs monitored
                                </p>
                            </div>
"""

        if changes:
            display_changes = changes[:MAX_CHANGES_IN_EMAIL]

            # Group changes by type for categorized rendering
            change_groups = defaultdict(list)
            for c in display_changes:
                change_groups[c.get("change_type", "status_change")].append(c)

            # Ordered categories with display metadata
            category_order = [
                ("status_change", "Funding Decisions", "#2563eb", "#eff6ff", "#dbeafe"),
                ("substatus_change", "Review Stage Updates", "#7c3aed", "#faf5ff", "#ede9fe"),
                ("disbursement", "Disbursement Activity", "#059669", "#f0fdf4", "#dcfce7"),
                ("f486_change", "Form 486 Updates", "#ea580c", "#fff7ed", "#ffedd5"),
                ("new_frn", "New FRNs Detected", "#0891b2", "#f0fdfa", "#ccfbf1"),
            ]

            badge_map = {
                "status_change": ("Status Change", "#2563eb", "#dbeafe"),
                "substatus_change": ("Review Stage", "#7c3aed", "#ede9fe"),
                "disbursement": ("Disbursement", "#059669", "#dcfce7"),
                "f486_change": ("Form 486", "#ea580c", "#ffedd5"),
                "new_frn": ("New FRN", "#0891b2", "#ccfbf1"),
            }

            for cat_type, cat_label, cat_color, cat_bg, cat_border in category_order:
                group = change_groups.get(cat_type, [])
                if not group:
                    continue

                # Category header
                html += f"""
                            <div style="margin-bottom: 4px; margin-top: 12px;">
                                <span style="display: inline-block; background-color: {cat_bg}; color: {cat_color}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 4px; border: 1px solid {cat_border};">{cat_label} ({len(group)})</span>
                            </div>
"""

                # Render each change as a card
                for c in group:
                    frn_num = c.get("frn", "")
                    entity = (c.get("entity_name", "") or "")[:40]
                    ben = c.get("ben", "")
                    fy = c.get("funding_year", "")
                    svc = c.get("service_type", "")
                    wave = c.get("wave_number", "")
                    amt = float(c.get("amount", 0) or 0)
                    disbursed = float(c.get("disbursed_amount", 0) or 0)
                    inv_mode = c.get("invoicing_mode", "")
                    ldi = c.get("last_date_to_invoice", "")
                    pending = c.get("pending_reason", "")

                    utilization = f"{(disbursed / amt * 100):.0f}%" if amt > 0 else "N/A"

                    badge_label, badge_color, badge_bg = badge_map.get(
                        c.get("change_type", "status_change"),
                        ("Change", "#64748b", "#f1f5f9")
                    )

                    # Build context line: FY | Service | Wave
                    context_parts = []
                    if fy:
                        context_parts.append(f"FY{fy}")
                    if svc:
                        context_parts.append(svc)
                    if wave:
                        context_parts.append(f"Wave {wave}")
                    context_line = " | ".join(context_parts) if context_parts else ""

                    # Status color for new value
                    new_lower = (c.get("new_status", "") or "").lower()
                    if "funded" in new_lower or "committed" in new_lower:
                        new_color = "#059669"
                    elif "denied" in new_lower:
                        new_color = "#dc2626"
                    else:
                        new_color = "#d97706"

                    # Transition text — add pending reason if substatus
                    old_display = c.get("old_status", "?")
                    new_display = c.get("new_status", "?")
                    if c.get("change_type") == "substatus_change" and pending:
                        new_display = f"{new_display}"

                    # Financial and invoicing details
                    financial_line = f"Commitment: ${amt:,.0f} | Disbursed: ${disbursed:,.0f} ({utilization})"
                    inv_parts = []
                    if inv_mode:
                        inv_parts.append(f"Inv Mode: {inv_mode}")
                    if ldi:
                        inv_parts.append(f"Last Inv: {ldi}")
                    inv_line = " | ".join(inv_parts)

                    frn_link = f"https://skyrate.ai/consultant?tab=frn-status&frn={frn_num}&ben={ben}"

                    updated_at = c.get("updated_at", "")
                    updated_display = ""
                    if updated_at:
                        try:
                            from datetime import datetime as dt
                            ua_dt = dt.fromisoformat(updated_at.replace('Z', '+00:00'))
                            updated_display = ua_dt.strftime('%b %d, %Y at %I:%M %p UTC')
                        except Exception:
                            updated_display = updated_at[:19].replace('T', ' ')

                    html += f"""
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <tr>
                                    <td style="background-color: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">
                                        <a href="{frn_link}" style="color: #0d9488; font-family: monospace; font-size: 13px; font-weight: 700; text-decoration: underline;">FRN {frn_num}</a>
                                        <span style="color: #334155; font-size: 12px;"> &mdash; {entity}</span>
                                        {f'<span style="color: #94a3b8; font-size: 11px;"> (BEN {ben})</span>' if ben else ''}
                                        {f'<br><span style="color: #94a3b8; font-size: 11px;">{context_line}</span>' if context_line else ''}
                                        {f'<br><span style="color: #94a3b8; font-size: 10px; font-style: italic;">USAC modified: {updated_display}</span>' if updated_display else ''}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 14px;">
                                        <span style="display: inline-block; background-color: {badge_bg}; color: {badge_color}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 8px; border-radius: 3px; margin-bottom: 6px;">{badge_label}</span>
                                        <div style="font-size: 13px; margin-top: 4px;">
                                            <span style="color: #64748b;">{old_display}</span>
                                            <span style="color: #94a3b8; margin: 0 4px;">&#8594;</span>
                                            <span style="color: {new_color}; font-weight: 600;">{new_display}</span>
                                        </div>
                                        <div style="color: #64748b; font-size: 11px; margin-top: 6px; font-family: monospace;">{financial_line}</div>
                                        {f'<div style="color: #94a3b8; font-size: 11px; margin-top: 2px; font-family: monospace;">{inv_line}</div>' if inv_line else ''}
                                    </td>
                                </tr>
                            </table>
"""

            if len(changes) > MAX_CHANGES_IN_EMAIL:
                html += f"""
                            <div style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">
                                ...and {len(changes) - MAX_CHANGES_IN_EMAIL} more changes.
                                <a href="https://skyrate.ai/consultant?tab=frn-status" style="color: #0d9488;">View all in dashboard</a>
                            </div>
"""

        html += """
                        </td>
                    </tr>
"""
        return html

    def _generate_portfolio_summary_html(self, watch_sections: List[Dict]) -> str:
        """Generate an aggregate portfolio summary table across all monitored FRNs."""
        # Aggregate FRNs across all watches into status buckets
        status_buckets = defaultdict(lambda: {"count": 0, "amount": 0.0, "disbursed": 0.0})
        seen_frns = set()  # Deduplicate across watches

        for section in watch_sections:
            for frn in section.get("frns", []):
                frn_num = frn.get("frn", "")
                if not frn_num or frn_num in seen_frns:
                    continue
                seen_frns.add(frn_num)

                status = (frn.get("status") or "").lower()
                amt = float(frn.get("commitment_amount", 0) or 0)
                disb = float(frn.get("disbursed_amount", 0) or 0)

                if "funded" in status or "committed" in status:
                    bucket = "Funded"
                elif "pending" in status:
                    bucket = "Pending"
                elif "denied" in status:
                    bucket = "Denied"
                else:
                    bucket = "Other"

                status_buckets[bucket]["count"] += 1
                status_buckets[bucket]["amount"] += amt
                status_buckets[bucket]["disbursed"] += disb

        if not seen_frns:
            return ""

        # Totals
        total_count = sum(b["count"] for b in status_buckets.values())
        total_amount = sum(b["amount"] for b in status_buckets.values())
        total_disbursed = sum(b["disbursed"] for b in status_buckets.values())
        total_util = f"{(total_disbursed / total_amount * 100):.0f}%" if total_amount > 0 else "N/A"

        def fmt_amount(v):
            if v >= 1_000_000:
                return f"${v / 1_000_000:,.1f}M"
            elif v >= 1_000:
                return f"${v / 1_000:,.0f}K"
            else:
                return f"${v:,.0f}"

        # Row builder
        def summary_row(label, color, data, is_last=False):
            util = f"{(data['disbursed'] / data['amount'] * 100):.0f}%" if data["amount"] > 0 else "N/A"
            border = "" if is_last else "border-bottom: 1px solid #e2e8f0;"
            return f"""
                                <tr>
                                    <td style="padding: 6px 10px; {border}"><span style="color: {color}; font-weight: 600; font-size: 12px;">{label}</span></td>
                                    <td style="padding: 6px 10px; text-align: center; {border} font-size: 12px;">{data['count']}</td>
                                    <td style="padding: 6px 10px; text-align: right; {border} font-family: monospace; font-size: 12px;">{fmt_amount(data['amount'])}</td>
                                    <td style="padding: 6px 10px; text-align: right; {border} font-family: monospace; font-size: 12px;">{fmt_amount(data['disbursed'])}</td>
                                    <td style="padding: 6px 10px; text-align: center; {border} font-size: 12px;">{util}</td>
                                </tr>"""

        # Render order with label colors
        row_defs = [
            ("Funded", "#059669"),
            ("Pending", "#d97706"),
            ("Denied", "#dc2626"),
            ("Other", "#64748b"),
        ]
        rows_html = ""
        active_rows = [(label, color) for label, color in row_defs if label in status_buckets]
        for i, (label, color) in enumerate(active_rows):
            rows_html += summary_row(label, color, status_buckets[label], is_last=(i == len(active_rows) - 1))

        return f"""
                    <tr>
                        <td style="padding: 16px 30px 0 30px;">
                            <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0;">
                                <h3 style="color: #0f766e; font-size: 14px; margin: 0 0 10px 0;">Portfolio Summary</h3>
                                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 12px;">
                                    <tr style="background-color: #f1f5f9;">
                                        <th style="text-align: left; padding: 6px 10px; color: #64748b; font-size: 11px; border-bottom: 1px solid #e2e8f0;">Status</th>
                                        <th style="text-align: center; padding: 6px 10px; color: #64748b; font-size: 11px; border-bottom: 1px solid #e2e8f0;">Count</th>
                                        <th style="text-align: right; padding: 6px 10px; color: #64748b; font-size: 11px; border-bottom: 1px solid #e2e8f0;">Amount</th>
                                        <th style="text-align: right; padding: 6px 10px; color: #64748b; font-size: 11px; border-bottom: 1px solid #e2e8f0;">Disbursed</th>
                                        <th style="text-align: center; padding: 6px 10px; color: #64748b; font-size: 11px; border-bottom: 1px solid #e2e8f0;">Util%</th>
                                    </tr>
{rows_html}
                                    <tr style="background-color: #f0fdfa;">
                                        <td style="padding: 8px 10px; font-weight: 700; font-size: 12px; color: #0f766e;">Total</td>
                                        <td style="padding: 8px 10px; text-align: center; font-weight: 700; font-size: 12px;">{total_count}</td>
                                        <td style="padding: 8px 10px; text-align: right; font-weight: 700; font-family: monospace; font-size: 12px;">{fmt_amount(total_amount)}</td>
                                        <td style="padding: 8px 10px; text-align: right; font-weight: 700; font-family: monospace; font-size: 12px;">{fmt_amount(total_disbursed)}</td>
                                        <td style="padding: 8px 10px; text-align: center; font-weight: 700; font-size: 12px;">{total_util}</td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
"""

    def _generate_first_snapshot_section_html(self, watch: FRNWatch, frns: List[Dict]) -> str:
        """Section for a watch that just took its initial snapshot"""
        funded = sum(1 for f in frns if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower())
        denied = sum(1 for f in frns if "denied" in (f.get("status") or "").lower())
        pending = sum(1 for f in frns if "pending" in (f.get("status") or "").lower())
        return f"""
                    <tr>
                        <td style="padding: 12px 30px;">
                            <div style="background-color: #f0f9ff; border-radius: 8px; border-left: 4px solid #0284c7; padding: 14px;">
                                <strong style="color: #0369a1; font-size: 14px;">{watch.name}</strong>
                                <span style="color: #64748b; font-size: 12px; margin-left: 8px;">Initial snapshot</span>
                                <p style="color: #475569; font-size: 12px; margin: 6px 0 0 0;">Now tracking {len(frns)} FRNs: {funded} funded | {pending} pending | {denied} denied</p>
                            </div>
                        </td>
                    </tr>
"""
    
    def _generate_no_changes_section_html(self, watch: FRNWatch, frns: List[Dict]) -> str:
        """Section for a watch with no changes since last report"""
        return f"""
                    <tr>
                        <td style="padding: 12px 30px;">
                            <div style="background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #16a34a; padding: 14px;">
                                <strong style="color: #15803d; font-size: 14px;">{watch.name}</strong>
                                <span style="color: #64748b; font-size: 12px; margin-left: 8px;">{len(frns)} FRNs</span>
                                <p style="color: #475569; font-size: 12px; margin: 6px 0 0 0;">No changes since last report.</p>
                            </div>
                        </td>
                    </tr>
"""
    
    def _generate_notification_section_html(self, watch: FRNWatch, frns: List[Dict], changes: List[Dict]) -> str:
        """Brief summary section for notification_only delivery mode"""
        funded = sum(1 for f in frns if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower())
        denied = sum(1 for f in frns if "denied" in (f.get("status") or "").lower())
        pending = sum(1 for f in frns if "pending" in (f.get("status") or "").lower())
        
        html = f"""
                    <tr>
                        <td style="padding: 12px 30px;">
                            <div style="background-color: #f0fdfa; border-radius: 8px; border-left: 4px solid #14b8a6; padding: 14px;">
                                <strong style="color: #0f766e; font-size: 14px;">{watch.name}</strong>
                                <span style="color: #64748b; font-size: 12px; margin-left: 8px;">{len(frns)} FRNs</span>
                                {f'<span style="color: #be185d; font-size: 12px; margin-left: 8px;">{len(changes)} changes</span>' if changes else ''}
                                <p style="color: #475569; font-size: 12px; margin: 6px 0 0 0;">
                                    <span style="color: #15803d;">{funded} funded</span> |
                                    <span style="color: #d97706;">{pending} pending</span> |
                                    <span style="color: #dc2626;">{denied} denied</span>
                                    &mdash; <a href="https://skyrate.ai/consultant?tab=frn-status" style="color: #0d9488; font-weight: 600;">View full details</a>
                                </p>
                            </div>
                        </td>
                    </tr>
"""
        return html
    
    def _generate_inapp_only_section_html(self, watch: FRNWatch, frns: List[Dict]) -> str:
        """Minimal marker for in_app_only watches (only in the stored HTML, not in email)"""
        return f"""
                    <!-- in_app_only: {watch.name} ({len(frns)} FRNs) — full details available in dashboard -->
"""
    
    # ==================== AI SUMMARY ====================
    
    def _generate_ai_summary(self, changes: List[Dict], user: User, watch_sections: List[Dict]) -> str:
        """
        Generate an intelligent natural-language summary of FRN changes using AI.
        Uses Gemini (fast/cheap) as primary, falls back to template if AI fails.
        """
        if not changes:
            return ""
        
        # Build a concise change description for the LLM
        status_transitions = {}
        entity_changes = {}
        total_amount = 0
        denied_entities = []
        
        for c in changes:
            old = c.get("old_status", "Unknown")
            new = c.get("new_status", "Unknown")
            key = f"{old} -> {new}"
            status_transitions[key] = status_transitions.get(key, 0) + 1
            
            entity = c.get("entity_name", "Unknown")
            entity_changes[entity] = entity_changes.get(entity, 0) + 1
            total_amount += float(c.get("amount", 0) or 0)
            
            if "denied" in new.lower():
                denied_entities.append(entity)
        
        # Try AI summary
        try:
            from utils.ai_models import AIModelManager
            ai = AIModelManager()
            
            changes_text = "\n".join(
                f"- FRN {c['frn']} for {c.get('entity_name', 'N/A')}: {c.get('old_status', '?')} -> {c.get('new_status', '?')} (${float(c.get('amount', 0) or 0):,.0f})"
                for c in changes[:30]  # Cap context sent to AI
            )
            
            prompt = f"""You are writing a brief FRN status change summary for an E-Rate consultant.
E-Rate is the federal program (managed by USAC/FCC) that provides funding for schools and libraries.
FRN = Funding Request Number. Key statuses: Funded/Committed (approved), Pending (under review), Denied (rejected - may need appeal).

USAC PIA SUBSTATUS URGENCY GUIDE (critical for correct tone):
- "15 Day Reminder Notice" or "15-Day" = CRITICAL: The applicant has only 15 calendar days to respond to USAC or the FRN will be DENIED. Flag this explicitly.
- "Letter of Inquiry" = HIGH URGENCY: USAC is requesting clarification; non-response leads to denial.
- "PIA Review" or "In PIA Review" = MEDIUM: Under review, no immediate action but monitor closely.
- "Outstanding" with "PIA" context = HIGH: Response to USAC is overdue.
- "FCDL" or "Commitment" = POSITIVE: Funding committed, no urgent action needed.
- "Disbursement" changes = POSITIVE: Funds disbursed, inform client.
Always match your summary tone to the urgency level above.

Here are the changes detected since the last report:
{changes_text}
{f"(Plus {len(changes) - 30} more changes not shown)" if len(changes) > 30 else ""}

Write a 2-4 sentence summary. Be specific about entity names, dollar amounts, and status transitions.
If any FRNs were denied, mention that an appeal should be considered.
Do NOT use emojis. Use plain professional language. Do NOT include a greeting or sign-off."""

            summary = ai.call_gemini(prompt)
            
            # Validate: AI should return reasonable text, not an error stub
            if summary and len(summary) > 20 and not summary.startswith("[AI"):
                # Sanitize HTML special chars
                summary = summary.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                return summary.strip()
        except Exception as e:
            logger.warning(f"AI summary generation failed: {e}")
        
        # Fallback: template-based summary
        return self._generate_template_summary(changes, status_transitions, denied_entities, total_amount)
    
    def _generate_template_summary(self, changes: List[Dict], status_transitions: Dict[str, int],
                                    denied_entities: List[str], total_amount: float) -> str:
        """Generate a simple template-based summary when AI is unavailable."""
        parts = []
        
        funded_count = sum(v for k, v in status_transitions.items() if "funded" in k.lower() or "committed" in k.lower())
        denied_count = sum(v for k, v in status_transitions.items() if "-> denied" in k.lower() or "-> Denied" in k)
        new_count = sum(v for k, v in status_transitions.items() if "[new]" in k.lower())
        other_count = len(changes) - funded_count - denied_count - new_count
        
        parts.append(f"{len(changes)} FRN{'s' if len(changes) != 1 else ''} changed status.")
        
        if funded_count:
            parts.append(f"{funded_count} moved to Funded/Committed.")
        if denied_count:
            unique_denied = list(set(denied_entities))
            entity_str = ", ".join(unique_denied[:3])
            if len(unique_denied) > 3:
                entity_str += f" and {len(unique_denied) - 3} more"
            parts.append(f"{denied_count} {'were' if denied_count > 1 else 'was'} Denied ({entity_str}) -- consider filing an appeal.")
        if new_count:
            parts.append(f"{new_count} new FRN{'s' if new_count != 1 else ''} appeared.")
        if total_amount > 0:
            parts.append(f"Total commitment amount involved: ${total_amount:,.0f}.")
        
        return " ".join(parts)
    
    # ==================== EMAIL & SMS DELIVERY ====================
    
    def _send_consolidated_email(self, user: User, watch_sections: List[Dict], html: str, 
                                  total_frns: int, recipient_email: str, cc_emails: List[str],
                                  report_id: int):
        """Send ONE consolidated email for all watches"""
        from .email_service import EmailService
        email_service = EmailService()
        
        email_html = html
        
        # Build a descriptive subject line
        total_changes = sum(len(s["changes"]) for s in watch_sections)
        any_first = any(s.get("is_first_snapshot", False) for s in watch_sections)
        
        if any_first and total_changes == 0:
            subject = "SkyRate: FRN monitoring activated — initial snapshot recorded"
        elif total_changes > 0:
            subject = f"SkyRate: {total_changes} FRN change{'s' if total_changes != 1 else ''} detected"
        else:
            subject = "SkyRate: No FRN changes to report"
        
        email_service.send_email(
            to_email=recipient_email,
            subject=subject,
            html_content=email_html,
            email_type='report'
        )
        
        for cc in cc_emails:
            try:
                email_service.send_email(
                    to_email=cc,
                    subject=subject,
                    html_content=email_html,
                    email_type='report'
                )
            except Exception as e:
                logger.error(f"Failed to send CC report to {cc}: {e}")
    
    def _send_sms_notification(self, user: User, watches: List[FRNWatch], 
                                report_id: int, total_frns: int) -> bool:
        """Send ONE SMS notification that the report is ready"""
        from .sms_service import SMSService
        sms_service = SMSService()
        
        if not sms_service.is_configured:
            logger.warning("SMS service not configured, skipping SMS notification")
            return False
        
        # Get phone number — check watch sms_phone overrides first, then user's phone
        phone = None
        for w in watches:
            if w.notify_sms and w.sms_phone:
                phone = w.sms_phone
                break
        
        if not phone:
            phone = user.phone
        
        if not phone:
            logger.warning(f"No phone number for user {user.id}, skipping SMS notification")
            return False
        
        # Check user SMS opt-in
        if not user.sms_opt_in:
            logger.info(f"User {user.id} has not opted in for SMS, skipping")
            return False
        
        num_watches = sum(1 for w in watches if w.notify_sms)
        message = (
            f"SkyRate: Your FRN Status Report is ready! "
            f"{total_frns} FRNs across {num_watches} monitor{'s' if num_watches != 1 else ''}. "
            f"View details: https://skyrate.ai/consultant?tab=frn-status"
        )
        
        return sms_service.send_sms(phone, message)
