"""
FRN Report Service
Generates and sends FRN status email reports for watch monitors
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session

from ..models.frn_watch import FRNWatch, WatchType, WatchFrequency
from ..models.user import User
from ..models.consultant import ConsultantProfile, ConsultantSchool
from ..models.vendor import VendorProfile

logger = logging.getLogger(__name__)


class FRNReportService:
    """Service for generating and sending FRN status reports"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def process_due_watches(self) -> Dict[str, Any]:
        """Process all watches that are due to send. Called by scheduler."""
        now = datetime.utcnow()
        
        due_watches = self.db.query(FRNWatch).filter(
            FRNWatch.is_active == True,
            FRNWatch.next_send_at <= now
        ).all()
        
        if not due_watches:
            return {"processed": 0, "sent": 0, "errors": 0}
        
        sent = 0
        errors = 0
        
        for watch in due_watches:
            try:
                result = self.process_single_watch(watch)
                if result.get("success"):
                    sent += 1
                else:
                    errors += 1
            except Exception as e:
                logger.error(f"Error processing watch {watch.id}: {e}")
                watch.last_error = str(e)
                errors += 1
        
        self.db.commit()
        
        return {
            "processed": len(due_watches),
            "sent": sent,
            "errors": errors
        }
    
    def process_single_watch(self, watch: FRNWatch) -> Dict[str, Any]:
        """Process a single watch: fetch data, generate report, send email"""
        try:
            # Fetch FRN data based on watch type
            frn_data = self._fetch_frn_data(watch)
            
            if not frn_data:
                watch.last_error = "No FRN data found"
                self.db.commit()
                return {"success": False, "message": "No FRN data found", "frn_count": 0}
            
            # Apply filters
            filtered = self._apply_filters(frn_data, watch)
            
            # Detect changes from last snapshot
            changes = self._detect_changes(filtered, watch.last_snapshot or {})
            
            # Generate HTML report
            html = self._generate_html_report(watch, filtered, changes)
            
            # Send email
            self._send_report_email(watch, html, len(filtered))
            
            # Update watch state
            watch.last_sent_at = datetime.utcnow()
            watch.next_send_at = watch.calculate_next_send()
            watch.send_count = (watch.send_count or 0) + 1
            watch.last_error = None
            watch.last_snapshot = {frn["frn"]: frn.get("status", "") for frn in filtered}
            
            self.db.commit()
            
            return {
                "success": True,
                "message": f"Report sent to {watch.recipient_email}",
                "frn_count": len(filtered),
                "changes_detected": len(changes)
            }
            
        except Exception as e:
            logger.error(f"Error processing watch {watch.id}: {e}")
            watch.last_error = str(e)
            self.db.commit()
            return {"success": False, "message": str(e), "frn_count": 0}
    
    def _fetch_frn_data(self, watch: FRNWatch) -> List[Dict]:
        """Fetch FRN data based on watch type"""
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        
        user = self.db.query(User).filter(User.id == watch.user_id).first()
        if not user:
            return []
        
        if watch.watch_type == WatchType.FRN.value:
            # Single FRN — look it up by BEN or batch
            # We don't have a direct FRN lookup, so use the portfolio approach
            # and filter to just this FRN
            all_frns = self._fetch_portfolio_frns(user, client, watch.funding_year)
            return [f for f in all_frns if f.get("frn") == watch.target_id]
        
        elif watch.watch_type == WatchType.BEN.value:
            # Single BEN
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
        
        # Check consultant profile
        profile = self.db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user.id
        ).first()
        
        if profile:
            schools = self.db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()
            bens = [s.ben for s in schools if s.ben]
            
            if bens:
                result = client.get_frn_status_batch(
                    bens,
                    year=funding_year
                )
                if result.get("success"):
                    for ben, ben_data in result.get("results", {}).items():
                        for frn in ben_data.get("frns", []):
                            frn["entity_name"] = ben_data.get("entity_name", f"BEN {ben}")
                            frn["ben"] = str(ben)
                            all_frns.append(frn)
        
        # Check vendor profile
        vendor_profile = self.db.query(VendorProfile).filter(
            VendorProfile.user_id == user.id
        ).first()
        
        if vendor_profile and vendor_profile.spin:
            result = client.get_frn_status_by_spin(
                vendor_profile.spin,
                year=funding_year
            )
            if result.get("success"):
                for frn in result.get("frns", []):
                    all_frns.append(frn)
        
        return all_frns
    
    def _apply_filters(self, frns: List[Dict], watch: FRNWatch) -> List[Dict]:
        """Apply watch filters to FRN list"""
        filtered = []
        
        for frn in frns:
            status = (frn.get("status") or "").lower()
            
            # Status inclusion filters
            if "funded" in status or "committed" in status:
                if not watch.include_funded:
                    continue
            elif "denied" in status:
                if not watch.include_denied:
                    continue
            elif "pending" in status:
                if not watch.include_pending:
                    continue
            
            # Status text filter
            if watch.status_filter:
                if watch.status_filter.lower() not in status:
                    continue
            
            filtered.append(frn)
        
        return filtered
    
    def _detect_changes(self, current_frns: List[Dict], last_snapshot: Dict) -> List[Dict]:
        """Compare current FRNs with last snapshot to detect changes"""
        changes = []
        
        if not last_snapshot:
            return []  # First report — no changes to detect
        
        for frn in current_frns:
            frn_num = frn.get("frn", "")
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
        
        # Check for new FRNs not in previous snapshot
        current_frn_numbers = {f.get("frn") for f in current_frns}
        old_frn_numbers = set(last_snapshot.keys())
        
        new_frns = current_frn_numbers - old_frn_numbers
        for frn in current_frns:
            if frn.get("frn") in new_frns:
                changes.append({
                    "frn": frn.get("frn", ""),
                    "entity_name": frn.get("entity_name", ""),
                    "old_status": "[New]",
                    "new_status": frn.get("status", ""),
                    "amount": float(frn.get("commitment_amount", 0) or 0),
                })
        
        return changes
    
    def _generate_html_report(self, watch: FRNWatch, frns: List[Dict], changes: List[Dict]) -> str:
        """Generate HTML email for the FRN status report"""
        now = datetime.utcnow()
        
        # Calculate summary
        funded_count = sum(1 for f in frns if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower())
        denied_count = sum(1 for f in frns if "denied" in (f.get("status") or "").lower())
        pending_count = sum(1 for f in frns if "pending" in (f.get("status") or "").lower())
        total_amount = sum(float(f.get("commitment_amount", 0) or 0) for f in frns)
        funded_amount = sum(float(f.get("commitment_amount", 0) or 0) for f in frns if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower())
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FRN Status Report — {watch.name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #0f766e, #0d9488); padding: 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FRN Status Report</h1>
                            <p style="color: #99f6e4; margin: 8px 0 0 0; font-size: 14px;">{watch.name}</p>
                            <p style="color: #99f6e4; margin: 4px 0 0 0; font-size: 12px;">{now.strftime('%B %d, %Y')}</p>
                        </td>
                    </tr>
"""
        
        # Changes section
        if watch.include_changes and changes:
            html += """
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <h2 style="color: #be185d; font-size: 16px; margin: 0 0 12px 0; border-bottom: 2px solid #fce7f3; padding-bottom: 8px;">Changes Since Last Report</h2>
                            <table width="100%" cellpadding="8" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: collapse; font-size: 13px;">
                                <tr style="background-color: #f8fafc;">
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">FRN</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Entity</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Previous</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Current</th>
                                </tr>
"""
            for change in changes:
                old_color = "#64748b"
                new_color = "#059669" if "funded" in change["new_status"].lower() else "#dc2626" if "denied" in change["new_status"].lower() else "#d97706"
                html += f"""
                                <tr>
                                    <td style="font-family: monospace; border-bottom: 1px solid #f1f5f9;">{change['frn']}</td>
                                    <td style="border-bottom: 1px solid #f1f5f9;">{change['entity_name'][:30]}</td>
                                    <td style="color: {old_color}; border-bottom: 1px solid #f1f5f9;">{change['old_status']}</td>
                                    <td style="color: {new_color}; font-weight: 600; border-bottom: 1px solid #f1f5f9;">{change['new_status']}</td>
                                </tr>
"""
            html += """
                            </table>
                        </td>
                    </tr>
"""
        
        # Summary section
        if watch.include_summary:
            html += f"""
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <h2 style="color: #334155; font-size: 16px; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Summary</h2>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td width="25%" style="padding: 12px; text-align: center; background-color: #f0fdf4; border-radius: 8px;">
                                        <div style="color: #15803d; font-size: 28px; font-weight: 700;">{funded_count}</div>
                                        <div style="color: #16a34a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Funded</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="25%" style="padding: 12px; text-align: center; background-color: #fffbeb; border-radius: 8px;">
                                        <div style="color: #a16207; font-size: 28px; font-weight: 700;">{pending_count}</div>
                                        <div style="color: #ca8a04; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Pending</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="25%" style="padding: 12px; text-align: center; background-color: #fef2f2; border-radius: 8px;">
                                        <div style="color: #b91c1c; font-size: 28px; font-weight: 700;">{denied_count}</div>
                                        <div style="color: #dc2626; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Denied</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="25%" style="padding: 12px; text-align: center; background-color: #f0f9ff; border-radius: 8px;">
                                        <div style="color: #1e40af; font-size: 28px; font-weight: 700;">{len(frns)}</div>
                                        <div style="color: #2563eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Total</div>
                                    </td>
                                </tr>
                            </table>
                            <p style="color: #64748b; font-size: 13px; margin: 12px 0 0 0;">
                                Total Committed: <strong style="color: #334155;">${total_amount:,.0f}</strong> |
                                Funded Amount: <strong style="color: #15803d;">${funded_amount:,.0f}</strong>
                            </p>
                        </td>
                    </tr>
"""
        
        # Details section
        if watch.include_details and frns:
            html += """
                    <tr>
                        <td style="padding: 24px 30px 0 30px;">
                            <h2 style="color: #334155; font-size: 16px; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">FRN Details</h2>
                            <table width="100%" cellpadding="8" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: collapse; font-size: 12px;">
                                <tr style="background-color: #f8fafc;">
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">FRN</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Entity</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Status</th>
                                    <th style="text-align: right; color: #64748b; border-bottom: 1px solid #e2e8f0;">Amount</th>
                                    <th style="text-align: left; color: #64748b; border-bottom: 1px solid #e2e8f0;">Year</th>
                                </tr>
"""
            for frn in frns[:50]:  # Limit to 50 FRNs in email
                status = frn.get("status", "Unknown")
                status_color = "#059669" if "funded" in status.lower() else "#dc2626" if "denied" in status.lower() else "#d97706"
                amount = float(frn.get("commitment_amount", 0) or 0)
                html += f"""
                                <tr>
                                    <td style="font-family: monospace; border-bottom: 1px solid #f1f5f9;">{frn.get('frn', 'N/A')}</td>
                                    <td style="border-bottom: 1px solid #f1f5f9; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">{(frn.get('entity_name') or 'N/A')[:35]}</td>
                                    <td style="color: {status_color}; font-weight: 600; border-bottom: 1px solid #f1f5f9;">{status}</td>
                                    <td style="text-align: right; border-bottom: 1px solid #f1f5f9;">${amount:,.0f}</td>
                                    <td style="border-bottom: 1px solid #f1f5f9;">{frn.get('funding_year', 'N/A')}</td>
                                </tr>
"""
            
            if len(frns) > 50:
                html += f"""
                                <tr>
                                    <td colspan="5" style="text-align: center; color: #94a3b8; padding: 12px;">
                                        ...and {len(frns) - 50} more FRNs. View all in your <a href="https://skyrate.ai/consultant" style="color: #0d9488;">SkyRate dashboard</a>.
                                    </td>
                                </tr>
"""
            
            html += """
                            </table>
                        </td>
                    </tr>
"""
        
        # Footer
        html += f"""
                    <tr>
                        <td style="padding: 24px 30px; border-top: 1px solid #e2e8f0; margin-top: 24px;">
                            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
                                This report was generated by <a href="https://skyrate.ai" style="color: #0d9488;">SkyRate AI</a> for watch "{watch.name}" ({watch.frequency}).
                                <br>Report #{watch.send_count + 1} | Next report: {watch.calculate_next_send().strftime('%B %d, %Y')}
                                <br><br>
                                To manage your report settings, visit your <a href="https://skyrate.ai/consultant" style="color: #0d9488;">dashboard</a>.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        return html
    
    def _send_report_email(self, watch: FRNWatch, html: str, frn_count: int):
        """Send the report email"""
        from .email_service import EmailService
        
        email_service = EmailService()
        
        subject = f"FRN Status Report: {watch.name} ({frn_count} FRNs)"
        
        # Send to primary recipient
        email_service.send_email(
            to_email=watch.recipient_email,
            subject=subject,
            html_content=html,
            email_type='report'
        )
        
        # Send to CC recipients
        for cc in (watch.cc_emails or []):
            try:
                email_service.send_email(
                    to_email=cc,
                    subject=subject,
                    html_content=html,
                    email_type='report'
                )
            except Exception as e:
                logger.error(f"Failed to send CC report to {cc}: {e}")
