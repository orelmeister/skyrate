"""
FRN Report Service (v2 - Consolidated)
Generates consolidated email reports and stores them for in-app viewing.
Groups all due watches per user into a single email.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy.orm import Session
from collections import defaultdict

from ..models.frn_watch import FRNWatch, WatchType, WatchFrequency, DeliveryMode
from ..models.frn_report_history import FRNReportHistory
from ..models.user import User
from ..models.consultant import ConsultantProfile, ConsultantSchool
from ..models.vendor import VendorProfile

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
                    
                    watch_sections.append({
                        "watch": watch,
                        "frns": filtered,
                        "changes": changes,
                        "funded": funded,
                        "denied": denied,
                        "pending": pending,
                        "amount": amount,
                        "is_first_snapshot": is_first_snapshot,
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
                    watch.last_snapshot = {f["frn"]: f.get("status", "") for f in filtered if f.get("frn")}
                    
                except Exception as e:
                    logger.error(f"Error processing watch {watch.id}: {e}")
                    watch.last_error = str(e)
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
            
            self.db.commit()
            
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
        """Fetch all FRNs across a user's portfolio"""
        all_frns = []
        
        profile = self.db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user.id
        ).first()
        
        if profile:
            schools = self.db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()
            bens = [s.ben for s in schools if s.ben]
            
            if bens:
                result = client.get_frn_status_batch(bens, year=funding_year)
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
            result = client.get_frn_status_by_spin(vendor_profile.spin, year=funding_year)
            if result.get("success"):
                for frn in result.get("frns", []):
                    all_frns.append(frn)
        
        return all_frns
    
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
        """Compare current FRNs with last snapshot to detect changes"""
        changes = []
        if not last_snapshot:
            return []
        
        current_frn_numbers = set()
        for frn in current_frns:
            frn_num = frn.get("frn", "")
            current_frn_numbers.add(frn_num)
            current_status = frn.get("status", "")
            old_status = last_snapshot.get(frn_num)
            
            if old_status and old_status != current_status:
                changes.append({
                    "frn": frn_num,
                    "entity_name": frn.get("entity_name", ""),
                    "old_status": old_status,
                    "new_status": current_status,
                    "amount": float(frn.get("commitment_amount", 0) or 0),
                })
        
        old_frn_numbers = set(last_snapshot.keys())
        for frn in current_frns:
            if frn.get("frn") in (current_frn_numbers - old_frn_numbers):
                changes.append({
                    "frn": frn.get("frn", ""),
                    "entity_name": frn.get("entity_name", ""),
                    "old_status": "[New]",
                    "new_status": frn.get("status", ""),
                    "amount": float(frn.get("commitment_amount", 0) or 0),
                })
        
        return changes
    
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
        
        # View in dashboard link
        html += f"""
                    <tr>
                        <td style="padding: 20px 30px; text-align: center;">
                            <a href="https://skyrate.ai/consultant" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0f766e, #0d9488); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">View Full Details in Dashboard</a>
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
                                To manage your report monitors, visit your <a href="https://skyrate.ai/consultant" style="color: #0d9488;">dashboard</a>.
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
        """Generate changes-focused section for a watch"""
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
        
        # Changes table (max MAX_CHANGES_IN_EMAIL rows)
        if changes:
            display_changes = changes[:MAX_CHANGES_IN_EMAIL]
            html += """
                            <table width="100%" cellpadding="6" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 6px; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">
                                <tr style="background-color: #fdf2f8;">
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Entity</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">FRN</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Previous</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Current</th>
                                    <th style="text-align: right; color: #64748b; border-bottom: 1px solid #e2e8f0;">Amount</th>
                                </tr>
"""
            for c in display_changes:
                new_color = "#059669" if "funded" in c["new_status"].lower() else "#dc2626" if "denied" in c["new_status"].lower() else "#d97706"
                amt = float(c.get("amount", 0) or 0)
                html += f"""
                                <tr>
                                    <td style="border-bottom: 1px solid #f1f5f9;">{(c.get('entity_name', '') or '')[:30]}</td>
                                    <td style="font-family: monospace; border-bottom: 1px solid #f1f5f9;">{c['frn']}</td>
                                    <td style="color: #64748b; border-bottom: 1px solid #f1f5f9;">{c['old_status']}</td>
                                    <td style="color: {new_color}; font-weight: 600; border-bottom: 1px solid #f1f5f9;">{c['new_status']}</td>
                                    <td style="text-align: right; font-family: monospace; border-bottom: 1px solid #f1f5f9;">${amt:,.0f}</td>
                                </tr>
"""
            if len(changes) > MAX_CHANGES_IN_EMAIL:
                html += f"""
                                <tr>
                                    <td colspan="5" style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">
                                        ...and {len(changes) - MAX_CHANGES_IN_EMAIL} more changes. View all in your dashboard.
                                    </td>
                                </tr>
"""
            html += """
                            </table>
"""
        
        html += """
                        </td>
                    </tr>
"""
        return html
    
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
                                    &mdash; <a href="https://skyrate.ai/consultant" style="color: #0d9488; font-weight: 600;">View full details</a>
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
            f"View it at https://skyrate.ai/consultant"
        )
        
        return sms_service.send_sms(phone, message)
