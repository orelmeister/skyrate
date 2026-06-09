"""
Email Service
Handles sending email notifications for alerts, digests, and summaries
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from ..core.config import settings
from ..models.alert import Alert, AlertType, AlertPriority

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending email notifications via Google Workspace"""
    
    # CSS for FRN detail tables used across all alert emails
    FRN_TABLE_CSS = """
        .frn-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
        .frn-table th { background: #1e3a5f; color: white; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .frn-table td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; }
        .frn-table tr:nth-child(even) td { background: #f9fafb; }
        .frn-table tr:hover td { background: #eff6ff; }
        .status-funded { color: #16a34a; font-weight: 600; }
        .status-denied { color: #dc2626; font-weight: 600; }
        .status-pending { color: #ca8a04; font-weight: 600; }
        .status-committed { color: #2563eb; font-weight: 600; }
        .deadline-urgent { color: #dc2626; font-weight: 700; }
        .deadline-warning { color: #ea580c; font-weight: 600; }
        .deadline-info { color: #2563eb; }
        .amount { font-family: 'Courier New', monospace; }
        .category-header { background: #f1f5f9; padding: 10px 15px; margin: 20px 0 5px 0; border-left: 4px solid #2563eb; border-radius: 4px; font-weight: 600; color: #1e3a5f; }
    """
    
    @staticmethod
    def _build_frn_detail_table(frn_rows: list, columns: list = None) -> str:
        """Build HTML table with FRN details from alert metadata.
        
        frn_rows: list of dicts, each with keys like ben, entity_name, frn, status, etc.
        columns: optional list of (key, label) tuples to display. Defaults to standard set.
        """
        if not frn_rows:
            return ""
        
        if columns is None:
            columns = [
                ("ben", "BEN"),
                ("entity_name", "Entity"),
                ("frn", "FRN#"),
                ("funding_year", "Year"),
                ("status", "Status"),
                ("deadline_type", "Deadline"),
                ("days_remaining", "Days Left"),
                ("commitment_amount", "Award"),
                ("disbursed_amount", "Disbursed"),
                ("spin_name", "Service Provider"),
            ]
        
        # Filter columns to only those that have at least one non-empty value
        active_cols = []
        for key, label in columns:
            if any(row.get(key) for row in frn_rows):
                active_cols.append((key, label))
        
        if not active_cols:
            return ""
        
        html = '<table class="frn-table"><thead><tr>'
        for key, label in active_cols:
            html += f'<th>{label}</th>'
        html += '</tr></thead><tbody>'
        
        for row in frn_rows:
            html += '<tr>'
            for key, label in active_cols:
                val = row.get(key, "")
                if val is None:
                    val = ""
                
                # Style status cells
                css_class = ""
                if key == "status":
                    status_lower = str(val).lower()
                    if "funded" in status_lower or "committed" in status_lower:
                        css_class = ' class="status-funded"'
                    elif "denied" in status_lower:
                        css_class = ' class="status-denied"'
                    elif "pending" in status_lower:
                        css_class = ' class="status-pending"'
                elif key == "days_remaining":
                    days = int(val) if val else 999
                    if days <= 7:
                        css_class = ' class="deadline-urgent"'
                    elif days <= 14:
                        css_class = ' class="deadline-warning"'
                    else:
                        css_class = ' class="deadline-info"'
                    if val:
                        val = f"{val} days"
                elif key in ("commitment_amount", "disbursed_amount", "remaining_amount"):
                    css_class = ' class="amount"'
                    try:
                        val = f"${float(val):,.2f}" if val else ""
                    except (ValueError, TypeError):
                        pass
                elif key == "old_to_new":
                    val = str(val) if val else ""
                
                html += f'<td{css_class}>{val}</td>'
            html += '</tr>'
        
        html += '</tbody></table>'
        return html
    
    @staticmethod
    def _build_status_change_table(frn_rows: list) -> str:
        """Build table specifically for FRN status change alerts."""
        columns = [
            ("ben", "BEN"),
            ("entity_name", "Entity"),
            ("frn", "FRN#"),
            ("funding_year", "Year"),
            ("old_status", "Old Status"),
            ("new_status", "New Status"),
            ("commitment_amount", "Award"),
            ("spin_name", "Service Provider"),
        ]
        return EmailService._build_frn_detail_table(frn_rows, columns)
    
    @staticmethod
    def _build_deadline_table(frn_rows: list) -> str:
        """Build table specifically for deadline alerts."""
        columns = [
            ("ben", "BEN"),
            ("entity_name", "Entity"),
            ("frn", "FRN#"),
            ("funding_year", "Year"),
            ("status", "FRN Status"),
            ("deadline_type", "Deadline"),
            ("deadline_date", "Due Date"),
            ("days_remaining", "Days Left"),
            ("commitment_amount", "Award"),
            ("disbursed_amount", "Disbursed"),
            ("spin_name", "Service Provider"),
        ]
        return EmailService._build_frn_detail_table(frn_rows, columns)
    
    # Sender routing by email type
    SENDER_MAP = {
        'alert': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'digest': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'weekly': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'deadline': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'report': ('alerts@skyrate.ai', 'SkyRate AI Reports'),
        'welcome': ('welcome@skyrate.ai', 'SkyRate AI'),
        'billing': ('billing@skyrate.ai', 'SkyRate AI Billing'),
        'noreply': ('noreply@skyrate.ai', 'SkyRate AI'),
        'support': ('support@skyrate.ai', 'SkyRate AI Support'),
        'news': ('news@skyrate.ai', 'SkyRate AI'),
    }
    
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL
        self.from_name = settings.FROM_NAME
        # Also check environment directly as fallback
        import os
        if not self.smtp_user:
            env_user = os.environ.get('SMTP_USER')
            env_pass = os.environ.get('SMTP_PASSWORD')
            if env_user:
                logger.warning(f"SMTP_USER not in settings but found in env: {env_user!r}. Using env fallback.")
                self.smtp_user = env_user
                self.smtp_password = env_pass
            else:
                logger.warning(f"SMTP_USER not found in settings or env. Settings value: {settings.SMTP_USER!r}, Env value: {env_user!r}")
    
    def _get_smtp_connection(self):
        """Create SMTP connection"""
        server = smtplib.SMTP(self.smtp_host, self.smtp_port)
        server.starttls()
        if self.smtp_user and self.smtp_password:
            server.login(self.smtp_user, self.smtp_password)
        return server
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str = None,
        email_type: str = 'alert'
    ) -> bool:
        """Send an email using the appropriate sender alias"""
        try:
            from_email, from_name = self.SENDER_MAP.get(
                email_type, (self.from_email, self.from_name)
            )
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{self.smtp_user}>"
            msg['To'] = to_email
            msg['Reply-To'] = f"{from_name} <{from_email}>"
            
            # Plain text version
            if text_content:
                part1 = MIMEText(text_content, 'plain')
                msg.attach(part1)
            
            # HTML version
            part2 = MIMEText(html_content, 'html')
            msg.attach(part2)
            
            # Send
            if self.smtp_user:  # Only send if configured
                with self._get_smtp_connection() as server:
                    # Use smtp_user as envelope sender (Google Workspace requires
                    # the authenticated user as envelope sender, not an alias)
                    server.sendmail(self.smtp_user, to_email, msg.as_string())
                logger.info(f"Email sent to {to_email} from {from_email} (envelope: {self.smtp_user}): {subject}")
            else:
                logger.warning(f"Email would be sent to {to_email} from {from_email}: {subject} (SMTP not configured)")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    def send_alert_email(self, to_email: str, alert: Alert) -> bool:
        """Send a single alert notification email with rich FRN detail tables"""
        priority_colors = {
            AlertPriority.CRITICAL.value: '#dc2626',
            AlertPriority.HIGH.value: '#ea580c',
            AlertPriority.MEDIUM.value: '#ca8a04',
            AlertPriority.LOW.value: '#2563eb',
        }
        
        color = priority_colors.get(alert.priority, '#6b7280')
        
        # Build FRN detail table from alert_metadata if available
        frn_detail_html = ""
        metadata = alert.alert_metadata or {}
        
        if alert.alert_type == AlertType.FRN_STATUS_CHANGE.value:
            frn_rows = metadata.get("frn_details", [])
            if not frn_rows and metadata.get("frn"):
                frn_rows = [metadata]
            if frn_rows:
                frn_detail_html = '<div class="category-header">FRN Status Changes</div>' + self._build_status_change_table(frn_rows)
        
        elif alert.alert_type in (AlertType.DEADLINE_APPROACHING.value, AlertType.APPEAL_DEADLINE.value):
            frn_rows = metadata.get("frn_details", [])
            if not frn_rows and metadata.get("frn"):
                frn_rows = [metadata]
            if frn_rows:
                deadline_type = metadata.get("deadline_type", "Deadline")
                frn_detail_html = f'<div class="category-header">{deadline_type} Details</div>' + self._build_deadline_table(frn_rows)
        
        elif alert.alert_type == AlertType.NEW_DENIAL.value:
            frn_rows = metadata.get("frn_details", [])
            if not frn_rows and metadata.get("frn"):
                frn_rows = [metadata]
            if frn_rows:
                frn_detail_html = '<div class="category-header">Denied FRNs</div>' + self._build_frn_detail_table(frn_rows, [
                    ("ben", "BEN"), ("entity_name", "Entity"), ("frn", "FRN#"),
                    ("funding_year", "Year"), ("status", "Status"), ("denial_reason", "Reason"),
                    ("commitment_amount", "Award"), ("spin_name", "Service Provider"),
                ])
        
        elif alert.alert_type == AlertType.PENDING_TOO_LONG.value:
            frn_rows = metadata.get("frn_details", [])
            if not frn_rows and metadata.get("frn"):
                frn_rows = [metadata]
            if frn_rows:
                frn_detail_html = '<div class="category-header">Long-Pending FRNs</div>' + self._build_frn_detail_table(frn_rows, [
                    ("ben", "BEN"), ("entity_name", "Entity"), ("frn", "FRN#"),
                    ("funding_year", "Year"), ("status", "Status"), ("days_pending", "Days Pending"),
                    ("commitment_amount", "Award"), ("spin_name", "Service Provider"),
                ])
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 700px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
                .alert-box {{ background: white; border-left: 4px solid {color}; padding: 15px; margin: 15px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                .priority {{ display: inline-block; background: {color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }}
                .cta-button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
                {self.FRN_TABLE_CSS}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">SkyRate AI Alert</h1>
                </div>
                <div class="content">
                    <div class="alert-box">
                        <div style="margin-bottom: 10px;">
                            <span class="priority">{alert.priority}</span>
                        </div>
                        <h2 style="margin: 0 0 10px 0; color: #1f2937;">{alert.title}</h2>
                        <p style="margin: 0; color: #4b5563;">{alert.message}</p>
                        {f'<p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;"><strong>Related:</strong> {alert.entity_name or ""}</p>' if alert.entity_name else ''}
                    </div>
                    
                    {frn_detail_html}
                    
                    <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard/notifications" class="cta-button">
                        View in Dashboard
                    </a>
                </div>
                <div class="footer">
                    <p>You're receiving this because you have email notifications enabled.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>&copy; {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
SkyRate AI Alert

{alert.title}

{alert.message}

Priority: {alert.priority}
{f'Related: {alert.entity_name}' if alert.entity_name else ''}

View in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard/notifications

---
To manage your notification preferences, visit: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[SkyRate AI] {alert.title}",
            html_content=html_content,
            text_content=text_content,
            email_type='alert'
        )
    
    def send_digest_email(
        self,
        to_email: str,
        user_name: str,
        alerts: List[Alert]
    ) -> bool:
        """Send daily digest email with FRN detail tables grouped by alert type"""
        
        # Group alerts by type
        by_type = {}
        for alert in alerts:
            if alert.alert_type not in by_type:
                by_type[alert.alert_type] = []
            by_type[alert.alert_type].append(alert)
        
        # Build alerts HTML with FRN detail tables
        alerts_html = ""
        for alert_type, type_alerts in by_type.items():
            type_name = alert_type.replace("_", " ").title()
            alerts_html += f'<h3 style="color: #1f2937; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">{type_name} ({len(type_alerts)})</h3>'
            
            # Collect all FRN rows from this alert type for a combined table
            all_frn_rows = []
            for alert in type_alerts:
                metadata = alert.alert_metadata or {}
                frn_rows = metadata.get("frn_details", [])
                if not frn_rows and metadata.get("frn"):
                    frn_rows = [metadata]
                all_frn_rows.extend(frn_rows)
            
            # Render a combined FRN table if we have data
            if all_frn_rows:
                if alert_type == AlertType.FRN_STATUS_CHANGE.value:
                    alerts_html += self._build_status_change_table(all_frn_rows)
                elif alert_type in (AlertType.DEADLINE_APPROACHING.value, AlertType.APPEAL_DEADLINE.value):
                    alerts_html += self._build_deadline_table(all_frn_rows)
                elif alert_type == AlertType.NEW_DENIAL.value:
                    alerts_html += self._build_frn_detail_table(all_frn_rows, [
                        ("ben", "BEN"), ("entity_name", "Entity"), ("frn", "FRN#"),
                        ("funding_year", "Year"), ("status", "Status"), ("denial_reason", "Reason"),
                        ("commitment_amount", "Award"), ("spin_name", "Service Provider"),
                    ])
                else:
                    alerts_html += self._build_frn_detail_table(all_frn_rows)
            else:
                # Fallback: show title/message cards if no structured FRN data
                for alert in type_alerts[:5]:
                    alerts_html += f"""
                    <div style="background: white; border-left: 3px solid #2563eb; padding: 10px 15px; margin: 10px 0; border-radius: 4px;">
                        <strong>{alert.title}</strong>
                        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:150]}{'...' if len(alert.message) > 150 else ''}</p>
                    </div>
                    """
                if len(type_alerts) > 5:
                    alerts_html += f'<p style="color: #6b7280; font-size: 14px;">...and {len(type_alerts) - 5} more</p>'
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
                .cta-button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
                .stats {{ display: flex; justify-content: space-around; margin: 20px 0; }}
                .stat {{ text-align: center; }}
                .stat-number {{ font-size: 32px; font-weight: bold; color: #2563eb; }}
                .stat-label {{ font-size: 12px; color: #6b7280; }}
                {self.FRN_TABLE_CSS}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">Daily Digest</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">{datetime.now().strftime('%B %d, %Y')}</p>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>Here's your daily summary of activity:</p>
                    
                    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <div style="font-size: 36px; font-weight: bold; color: #2563eb;">{len(alerts)}</div>
                        <div style="color: #6b7280;">New alerts today</div>
                    </div>
                    
                    {alerts_html}
                    
                    <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard/notifications" class="cta-button">
                        View All in Dashboard
                    </a>
                </div>
                <div class="footer">
                    <p>You're receiving this daily digest because you opted in.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>\u00a9 {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
Daily Digest - {datetime.now().strftime('%B %d, %Y')}

Hi {user_name},

You have {len(alerts)} new alerts today.

"""
        for alert in alerts[:10]:
            text_content += f"- {alert.title}\n  {alert.message[:100]}...\n\n"
        
        text_content += f"""
View all in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard/notifications
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[SkyRate AI] Daily Digest - {len(alerts)} alerts",
            html_content=html_content,
            text_content=text_content,
            email_type='digest'
        )
    
    def send_frn_digest_email(
        self,
        to_email: str,
        user_name: str,
        changes: list,
        role: str = "consultant",
    ) -> bool:
        """
        Send FRN status change digest email using queue items.
        Each change is a FrnStatusChangeQueue row with ben, frn, old_status, new_status,
        old_amount, new_amount, entity_name.
        """
        from ..core.config import settings
        
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
        
        # Group by entity/BEN
        by_entity = {}
        for c in changes:
            key = c.entity_name or c.ben or "Unknown"
            if key not in by_entity:
                by_entity[key] = []
            by_entity[key].append(c)
        
        # Build rows HTML
        rows_html = ""
        denial_count = 0
        for entity, items in by_entity.items():
            for item in items:
                new_status = item.new_status or "Unknown"
                is_denial = "denied" in new_status.lower()
                if is_denial:
                    denial_count += 1
                status_color = "#dc2626" if is_denial else "#059669" if "committed" in new_status.lower() or "funded" in new_status.lower() else "#d97706"
                
                # Deep link: /dashboard/frn-status?frn=XXXXX
                frn_link = f"{frontend_url}/dashboard/frn-status?frn={item.frn}"
                
                amount_cell = ""
                if item.old_amount is not None and item.new_amount is not None and item.old_amount != item.new_amount:
                    amount_cell = f"${item.old_amount:,.0f} -> ${item.new_amount:,.0f}"
                elif item.new_amount is not None:
                    amount_cell = f"${item.new_amount:,.0f}"
                
                rows_html += f"""
                <tr>
                    <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{entity}</td>
                    <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;"><a href="{frn_link}" style="color:#2563eb;">{item.frn}</a></td>
                    <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{item.old_status or '-'}</td>
                    <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; color:{status_color}; font-weight:600;">{new_status}</td>
                    <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{amount_cell}</td>
                </tr>
                """
        
        subject = f"[SkyRate] FRN Digest - {len(changes)} status change{'s' if len(changes) != 1 else ''}"
        if denial_count:
            subject += f" ({denial_count} denial{'s' if denial_count != 1 else ''})"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 650px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 22px;">FRN Status Digest</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">{datetime.now().strftime('%B %d, %Y')} | {len(changes)} change{'s' if len(changes) != 1 else ''} across {len(by_entity)} entit{'ies' if len(by_entity) != 1 else 'y'}</p>
                </div>
                <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p>Hi {user_name},</p>
                    <p>Here are your FRN status changes since your last digest:</p>
                    
                    <table style="width:100%; border-collapse:collapse; background:white; border-radius:6px; overflow:hidden; font-size:13px;">
                        <thead>
                            <tr style="background:#f3f4f6;">
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Entity</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">FRN</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Old Status</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">New Status</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows_html}
                        </tbody>
                    </table>
                    
                    <a href="{frontend_url}/dashboard/frn-status" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; margin-top:15px;">
                        View Full Dashboard
                    </a>
                </div>
                <div style="text-align:center; color:#6b7280; font-size:12px; margin-top:20px;">
                    <p>You're receiving this because FRN digest is enabled in your settings.</p>
                    <p><a href="{frontend_url}/settings/notifications" style="color:#2563eb;">Manage preferences</a></p>
                    <p>&copy; {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text fallback
        text_content = f"FRN Status Digest - {datetime.now().strftime('%B %d, %Y')}\n\n"
        text_content += f"Hi {user_name},\n\n{len(changes)} FRN status changes:\n\n"
        for c in changes[:20]:
            text_content += f"- FRN {c.frn} ({c.entity_name or c.ben}): {c.old_status} -> {c.new_status}\n"
        if len(changes) > 20:
            text_content += f"\n...and {len(changes) - 20} more. View all: {frontend_url}/dashboard/frn-status\n"
        
        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            email_type='frn_digest'
        )

    def _get_role_frn_url(self, role: str, frn: str = "", ben: str = "", spin: str = "") -> str:
        """Return role-aware deep link to the FRN status page."""
        from ..core.config import settings
        base = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
        if role == "vendor":
            url = f"{base}/vendor?tab=frn-status"
            if frn:
                url += f"&frn={frn}"
            if spin:
                url += f"&spin={spin}"
        elif role == "applicant":
            url = f"{base}/applicant?tab=frn-status"
            if frn:
                url += f"&frn={frn}"
        elif role in ("super", "admin", "consultant"):
            # super/admin land in the consultant portal for deep-linking; the
            # consultant page accepts those roles and handles ?frn=&ben= params.
            # The /super page is a nav hub only and does not deep-link to FRNs.
            url = f"{base}/consultant?tab=frn-status"
            if frn:
                url += f"&frn={frn}"
            if ben:
                url += f"&ben={ben}"
        else:
            url = f"{base}/consultant?tab=frn-status"
            if frn:
                url += f"&frn={frn}"
            if ben:
                url += f"&ben={ben}"
        return url

    def send_frn_digest_email_v2(
        self,
        to_email: str,
        user_name: str,
        changes: list,
        collapsed_count: int = 0,
        role: str = "consultant",
    ) -> bool:
        """
        V2 FRN digest email with deduped changes, bucketed categories,
        role-aware links, and a proper subject line.
        Each change is a dict with: frn, ben, entity_name, old_status, new_status, new_amount.
        """
        from ..core.config import settings
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')

        # Bucket changes by category
        funded = []
        denied = []
        pia = []
        amount_changed = []
        cancelled = []
        other = []

        for c in changes:
            ns = (c.get("new_status") or "").lower()
            if "committed" in ns or "funded" in ns:
                funded.append(c)
            elif "denied" in ns:
                denied.append(c)
            elif "pia" in ns or "selective" in ns or "review" in ns:
                pia.append(c)
            elif "cancel" in ns or "withdrawn" in ns:
                cancelled.append(c)
            elif c.get("new_amount") is not None and c.get("old_status", "").lower() == c.get("new_status", "").lower():
                amount_changed.append(c)
            else:
                other.append(c)

        total = len(changes)
        # Build subject line
        parts = []
        if funded:
            parts.append(f"{len(funded)} funded")
        if denied:
            parts.append(f"{len(denied)} denied")
        if pia:
            parts.append(f"{len(pia)} PIA")
        subject = f"[SkyRate] {total} FRN update{'s' if total != 1 else ''} in your portfolio"
        if parts:
            subject += " - " + ", ".join(parts)

        # Build rows HTML (capped at 50)
        display_changes = changes[:50]
        overflow = total - 50 if total > 50 else 0

        rows_html = ""
        for c in display_changes:
            ns = c.get("new_status") or "Unknown"
            ns_lower = ns.lower()
            if "denied" in ns_lower:
                pill_class = "background:#fee2e2;color:#991b1b;"
            elif "committed" in ns_lower or "funded" in ns_lower:
                pill_class = "background:#d1fae5;color:#065f46;"
            elif "pia" in ns_lower or "review" in ns_lower:
                pill_class = "background:#fef3c7;color:#92400e;"
            elif "cancel" in ns_lower or "withdrawn" in ns_lower:
                pill_class = "background:#e5e7eb;color:#374151;"
            else:
                pill_class = "background:#e0e7ff;color:#3730a3;"

            view_url = self._get_role_frn_url(role, frn=c.get("frn", ""), ben=c.get("ben", ""))
            amount_str = f"${c['new_amount']:,.0f}" if c.get("new_amount") else "-"

            rows_html += f"""
            <tr>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{c.get('entity_name') or c.get('ben') or '-'}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{c.get('frn', '-')}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{c.get('old_status') or '-'}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.78em;font-weight:600;{pill_class}">{ns}</span></td>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">{amount_str}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;"><a href="{view_url}" style="display:inline-block;padding:4px 10px;background:#2563eb;color:#fff;text-decoration:none;border-radius:4px;font-size:0.82em;">View</a></td>
            </tr>
            """

        overflow_html = ""
        if overflow > 0:
            all_url = self._get_role_frn_url(role)
            overflow_html = f'<p style="color:#6b7280;font-size:0.85em;margin-top:12px;">+{overflow} more changes. <a href="{all_url}" style="color:#2563eb;">View all in portal</a></p>'

        collapsed_html = ""
        if collapsed_count > 0:
            collapsed_html = f'<p style="color:#6b7280;font-size:0.85em;margin-top:8px;">{collapsed_count} FRN{"s" if collapsed_count != 1 else ""} flipped and reverted (no net change) - collapsed and not shown.</p>'

        view_all_url = self._get_role_frn_url(role)

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 680px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 22px;">FRN Daily Digest</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">{datetime.now().strftime('%B %d, %Y')}</p>
                </div>
                <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p>Hi {user_name},</p>
                    <p>Here's what changed in your portfolio today.</p>

                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                        {"".join(f'<div style="flex:1;min-width:100px;background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0;"><div style="font-size:1.6em;font-weight:bold;color:#1e3a5f;">{count}</div><div style="font-size:0.78em;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">{label}</div></div>' for label, count in [("Funded", len(funded)), ("Denied", len(denied)), ("PIA", len(pia)), ("Other", len(amount_changed) + len(cancelled) + len(other))] if count > 0)}
                    </div>

                    <table style="width:100%; border-collapse:collapse; background:white; border-radius:6px; overflow:hidden; font-size:13px;">
                        <thead>
                            <tr style="background:#f3f4f6;">
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Entity</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">FRN</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Was</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Now</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;">Amount</th>
                                <th style="padding:10px 12px; text-align:left; font-weight:600;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows_html}
                        </tbody>
                    </table>

                    {overflow_html}
                    {collapsed_html}

                    <a href="{view_all_url}" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; margin-top:15px;">
                        View All in Portfolio
                    </a>
                </div>
                <div style="text-align:center; color:#6b7280; font-size:12px; margin-top:20px;">
                    <p>You're receiving this because FRN digest is enabled in your settings.</p>
                    <p><a href="{frontend_url}/settings/notifications" style="color:#2563eb;">Manage preferences</a></p>
                    <p>&copy; {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text_content = f"FRN Daily Digest - {datetime.now().strftime('%B %d, %Y')}\n\n"
        text_content += f"Hi {user_name},\n\n{total} FRN status changes:\n\n"
        for c in display_changes[:20]:
            text_content += f"- FRN {c.get('frn')} ({c.get('entity_name') or c.get('ben')}): {c.get('old_status')} -> {c.get('new_status')}\n"
        if total > 20:
            text_content += f"\n...and {total - 20} more. View all: {view_all_url}\n"

        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            email_type='frn_digest'
        )

    def send_frn_digest_heartbeat(
        self,
        to_email: str,
        user_name: str,
        role: str = "consultant",
    ) -> bool:
        """Send a heartbeat email when no FRN changes occurred for a user's portfolio."""
        from ..core.config import settings
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
        view_all_url = self._get_role_frn_url(role)

        subject = "[SkyRate] All quiet - no FRN changes today"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 22px;">FRN Daily Digest</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">{datetime.now().strftime('%B %d, %Y')}</p>
                </div>
                <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p>Hi {user_name},</p>
                    <p>All quiet - no FRN status changes in your portfolio today. We will notify you as soon as something moves.</p>
                    <a href="{view_all_url}" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; margin-top:10px;">
                        View Portfolio Dashboard
                    </a>
                </div>
                <div style="text-align:center; color:#6b7280; font-size:12px; margin-top:20px;">
                    <p><a href="{frontend_url}/settings/notifications" style="color:#2563eb;">Manage preferences</a></p>
                    <p>&copy; {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_content = f"Hi {user_name},\n\nAll quiet - no FRN status changes in your portfolio today.\n\nView your portfolio: {view_all_url}\n"

        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            email_type='frn_digest'
        )

    def send_weekly_summary_email(
        self,
        to_email: str,
        user_name: str,
        summary: Dict[str, Any],
        top_alerts: List[Alert]
    ) -> bool:
        """Send weekly summary email with FRN detail tables"""
        
        # Group alerts by type for better summary
        denials_list = [a for a in top_alerts if a.alert_type == 'new_denial']
        status_changes_list = [a for a in top_alerts if a.alert_type == 'frn_status_change']
        deadlines_list = [a for a in top_alerts if a.alert_type == 'deadline_approaching']
        other_alerts = [a for a in top_alerts if a.alert_type not in ['new_denial', 'frn_status_change', 'deadline_approaching']]
        
        # Build FRN detail sections for each alert type group
        def _collect_frn_rows(alert_list):
            rows = []
            for a in alert_list:
                md = a.alert_metadata or {}
                frn_rows = md.get("frn_details", [])
                if not frn_rows and md.get("frn"):
                    frn_rows = [md]
                rows.extend(frn_rows)
            return rows
        
        alerts_html = ""
        
        # Denials section with table
        if denials_list:
            alerts_html += '<div class="category-header">Denials This Week</div>'
            denial_rows = _collect_frn_rows(denials_list)
            if denial_rows:
                alerts_html += self._build_frn_detail_table(denial_rows, [
                    ("ben", "BEN"), ("entity_name", "Entity"), ("frn", "FRN#"),
                    ("funding_year", "Year"), ("denial_reason", "Reason"),
                    ("commitment_amount", "Award"), ("spin_name", "Provider"),
                ])
            else:
                for alert in denials_list[:3]:
                    alerts_html += f'<div style="background: white; border-left: 3px solid #dc2626; padding: 10px 15px; margin: 10px 0; border-radius: 4px;"><strong>{alert.title}</strong><p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:150]}</p></div>'
        
        # Status changes section with table
        if status_changes_list:
            alerts_html += '<div class="category-header">Status Changes This Week</div>'
            sc_rows = _collect_frn_rows(status_changes_list)
            if sc_rows:
                alerts_html += self._build_status_change_table(sc_rows)
            else:
                for alert in status_changes_list[:3]:
                    alerts_html += f'<div style="background: white; border-left: 3px solid #2563eb; padding: 10px 15px; margin: 10px 0; border-radius: 4px;"><strong>{alert.title}</strong><p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:150]}</p></div>'
        
        # Deadlines section with table
        if deadlines_list:
            alerts_html += '<div class="category-header">Upcoming Deadlines</div>'
            dl_rows = _collect_frn_rows(deadlines_list)
            if dl_rows:
                alerts_html += self._build_deadline_table(dl_rows)
            else:
                for alert in deadlines_list[:3]:
                    alerts_html += f'<div style="background: white; border-left: 3px solid #ea580c; padding: 10px 15px; margin: 10px 0; border-radius: 4px;"><strong>{alert.title}</strong><p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:150]}</p></div>'
        
        # Other alerts (fallback card style)
        if other_alerts:
            alerts_html += '<div class="category-header">Other Activity</div>'
            for alert in other_alerts[:5]:
                alerts_html += f'<div style="background: white; border-left: 3px solid #6b7280; padding: 10px 15px; margin: 10px 0; border-radius: 4px;"><strong>{alert.title}</strong><p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:150]}</p></div>'
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
                .stat-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }}
                .stat-card {{ background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                .stat-number {{ font-size: 28px; font-weight: bold; color: #2563eb; }}
                .stat-label {{ font-size: 12px; color: #6b7280; margin-top: 5px; }}
                .cta-button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
                {self.FRN_TABLE_CSS}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">Weekly Summary</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">Week of {datetime.now().strftime('%B %d, %Y')}</p>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>Here's your weekly E-Rate activity summary:</p>
                    
                    <div class="stat-grid">
                        <div class="stat-card">
                            <div class="stat-number">{summary.get('total_alerts', 0)}</div>
                            <div class="stat-label">Total Alerts</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number" style="color: #dc2626;">{summary.get('denials', 0)}</div>
                            <div class="stat-label">Denials</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">{summary.get('status_changes', 0)}</div>
                            <div class="stat-label">Status Changes</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number" style="color: #ea580c;">{summary.get('deadlines', 0)}</div>
                            <div class="stat-label">Deadlines</div>
                        </div>
                    </div>
                    
                    <h3 style="color: #1f2937; margin: 20px 0 10px 0;">Recent Activity</h3>
                    {alerts_html if alerts_html else '<p style="color: #6b7280;">No alerts this week</p>'}
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications?view=alerts" class="cta-button">
                            View All Alerts
                        </a>
                    </div>
                </div>
                <div class="footer">
                    <p>You're receiving this weekly summary because you opted in.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>\u00a9 {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Build detailed text summary
        text_alerts = ""
        for alert in top_alerts:
            entity_info = f" ({alert.entity_type.upper()}: {alert.entity_id})" if alert.entity_id else ""
            text_alerts += f"- {alert.title}{entity_info}\n  {alert.message[:100]}{'...' if len(alert.message) > 100 else ''}\n\n"
        
        text_content = f"""
Weekly Summary - Week of {datetime.now().strftime('%B %d, %Y')}

Hi {user_name},

Here's your weekly E-Rate activity summary:

Total Alerts: {summary.get('total_alerts', 0)}
Denials: {summary.get('denials', 0)}
Status Changes: {summary.get('status_changes', 0)}
Deadlines: {summary.get('deadlines', 0)}

Recent Activity:
{text_alerts if text_alerts else 'No alerts this week'}

View All Alerts: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications?view=alerts
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[SkyRate AI] Weekly Summary - {summary.get('total_alerts', 0)} alerts this week",
            html_content=html_content,
            text_content=text_content,
            email_type='weekly'
        )
    
    def send_appeal_deadline_reminder(
        self,
        to_email: str,
        user_name: str,
        frn: str,
        school_name: str,
        days_remaining: int,
        appeal_url: str
    ) -> bool:
        """Send appeal deadline reminder email"""
        
        urgency_color = "#dc2626" if days_remaining <= 7 else "#ea580c" if days_remaining <= 14 else "#ca8a04"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
                .countdown {{ background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid {urgency_color}; }}
                .countdown-number {{ font-size: 48px; font-weight: bold; color: {urgency_color}; }}
                .cta-button {{ display: inline-block; background: {urgency_color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">⚠️ Appeal Deadline Reminder</h1>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>This is a reminder that your appeal deadline for <strong>FRN {frn}</strong> ({school_name}) is approaching.</p>
                    
                    <div class="countdown">
                        <div class="countdown-number">{days_remaining}</div>
                        <div style="color: #6b7280;">days remaining</div>
                    </div>
                    
                    <p>Don't lose your funding! Review and submit your appeal before the deadline.</p>
                    
                    <a href="{appeal_url}" class="cta-button">
                        Review Your Appeal
                    </a>
                </div>
                <div class="footer">
                    <p>\u00a9 {datetime.now().year} SkyRate AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"\u26a0\ufe0f [SkyRate AI] Appeal Deadline: {days_remaining} days left for FRN {frn}",
            html_content=html_content,
            text_content=f"Appeal Deadline Reminder\n\nFRN {frn} ({school_name})\n\n{days_remaining} days remaining\n\nReview your appeal: {appeal_url}",
            email_type='deadline'
        )

    def send_welcome_email(self, to_email: str, first_name: str, role: str) -> bool:
        """Send welcome email after registration with role-specific content"""
        
        role_content = {
            'consultant': {
                'title': 'E-Rate Consultant',
                'features': [
                    ('Portfolio Management', 'Monitor all your schools and their FRN statuses from one dashboard'),
                    ('AI-Powered Appeals', 'Generate professional appeal letters in seconds when FRNs are denied'),
                    ('Deadline Alerts', 'Never miss an appeal deadline with automatic reminders'),
                    ('Status Monitoring', 'Get notified instantly when any FRN status changes'),
                ],
                'cta_text': 'Set Up Your Portfolio',
            },
            'vendor': {
                'title': 'E-Rate Vendor',
                'features': [
                    ('Form 470 Lead Discovery', 'Find new opportunities matching your products and services'),
                    ('SPIN Status Tracking', 'Monitor your SPIN status and applications'),
                    ('Competitor Analysis', 'Stay ahead with insights on competitor activity'),
                    ('Market Intelligence', 'Track E-Rate spending trends in your service areas'),
                ],
                'cta_text': 'Explore Your Leads',
            },
            'applicant': {
                'title': 'E-Rate Applicant',
                'features': [
                    ('FRN Monitoring', 'Track all your funding requests in real-time'),
                    ('Denial Analysis', 'Understand why FRNs are denied with AI-powered analysis'),
                    ('Auto-Generated Appeals', 'Get AI-drafted appeal letters ready for review'),
                    ('Disbursement Tracking', 'Know exactly when funding is disbursed'),
                ],
                'cta_text': 'View Your FRNs',
            },
        }
        
        content = role_content.get(role, role_content['applicant'])
        
        features_html = ''
        for feat_name, feat_desc in content['features']:
            features_html += f'''
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">
                <strong style="color: #1e293b; font-size: 14px;">{feat_name}</strong>
                <div style="color: #64748b; font-size: 13px; margin-top: 4px;">{feat_desc}</div>
              </td>
            </tr>'''
        
        html_content = f'''
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 12px 24px; border-radius: 12px;">
                <span style="color: white; font-size: 24px; font-weight: bold;">SkyRate<span style="color: #c4b5fd;">.AI</span></span>
              </div>
            </div>
            
            <!-- Welcome Card -->
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h1 style="color: #1e293b; font-size: 24px; margin: 0 0 8px 0;">Welcome to SkyRate AI, {first_name}! \U0001f389</h1>
              <p style="color: #64748b; font-size: 15px; margin: 0 0 24px 0;">
                Your account is set up as an <strong style="color: #7c3aed;">{content['title']}</strong>. 
                Here\'s what you can do:
              </p>
              
              <!-- Features -->
              <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
                {features_html}
              </table>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 24px 0;">
                <a href="{settings.FRONTEND_URL}/onboarding" 
                   style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  {content['cta_text']} \u2192
                </a>
              </div>
              
              <!-- What's Next -->
              <div style="background: #faf5ff; border-radius: 10px; padding: 16px; margin-top: 16px;">
                <p style="color: #6b21a8; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">What happens next?</p>
                <ol style="color: #7e22ce; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>We\'ll pull your E-Rate data from USAC</li>
                  <li>Choose your alert preferences</li>
                  <li>Start monitoring your FRNs automatically</li>
                </ol>
              </div>
            </div>
            
            <!-- Trial Info -->
            <div style="text-align: center; margin-top: 24px; padding: 16px;">
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                You have a <strong>14-day free trial</strong>. No charges until your trial ends.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; margin-top: 16px; padding: 16px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                SkyRate AI \u00b7 E-Rate Funding Intelligence<br>
                <a href="{settings.FRONTEND_URL}" style="color: #7c3aed;">skyrate.ai</a> \u00b7 
                <a href="mailto:support@skyrate.ai" style="color: #7c3aed;">support@skyrate.ai</a>
              </p>
            </div>
          </div>
        </body>
        </html>
        '''
        
        text_content = f"""Welcome to SkyRate AI, {first_name}!

Your account is set up as an {content['title']}.

Get started: {settings.FRONTEND_URL}/onboarding

What's next:
1. We'll pull your E-Rate data from USAC
2. Choose your alert preferences
3. Start monitoring your FRNs automatically

You have a 14-day free trial. No charges until your trial ends.

---
SkyRate AI - E-Rate Funding Intelligence
https://skyrate.ai | support@skyrate.ai
"""
        
        return self.send_email(
            to_email=to_email,
            subject=f"Welcome to SkyRate AI, {first_name}! \U0001f680",
            html_content=html_content,
            text_content=text_content,
            email_type='welcome'
        )

    def send_admin_new_user_notification(self, user_email: str, user_name: str, role: str) -> bool:
        """Notify admin when a new user signs up"""
        html_content = f'''
        <div style="font-family: sans-serif; padding: 20px; background: #f8fafc;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin: 0 0 16px 0;">\U0001f195 New User Registration</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #64748b;">Name:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600;">{user_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0; color: #1e293b;">{user_email}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Role:</td><td style="padding: 8px 0; color: #7c3aed; font-weight: 600;">{role.title()}</td></tr>
            </table>
            <div style="margin-top: 16px;">
              <a href="{settings.FRONTEND_URL}/admin" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">View in Admin Dashboard</a>
            </div>
          </div>
        </div>
        '''
        
        return self.send_email(
            to_email='admin@skyrate.ai',
            subject=f"New User: {user_name} ({role.title()})",
            html_content=html_content,
            text_content=f"New user registration: {user_name} ({user_email}) - {role.title()}",
            email_type='alert'
        )

    def send_verification_email(self, to_email: str, first_name: str, verification_token: str) -> bool:
        """Send email with a one-click verification link (token-based)"""
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"

        html_content = f'''
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 12px 24px; border-radius: 12px;">
                <span style="color: white; font-size: 20px; font-weight: bold;">SkyRate<span style="color: #c4b5fd;">.AI</span></span>
              </div>
            </div>
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="color: #1e293b; margin: 0 0 12px 0; text-align: center;">Verify Your Email</h2>
              <p style="color: #64748b; font-size: 14px; text-align: center; margin: 0 0 24px 0;">
                Hi {first_name}, click the button below to verify your email and activate your SkyRate AI account.
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="{verify_url}"
                   style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Verify Email Address
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                Or copy this link: <br>
                <a href="{verify_url}" style="color: #7c3aed; word-break: break-all;">{verify_url}</a>
              </p>
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px;">
                This link expires in 24 hours. If you didn't create an account, ignore this email.
              </p>
            </div>
          </div>
        </body>
        </html>
        '''

        return self.send_email(
            to_email=to_email,
            subject="SkyRate AI - Verify Your Email Address",
            html_content=html_content,
            text_content=f"Hi {first_name}, verify your email: {verify_url}\n\nThis link expires in 24 hours.",
            email_type='noreply'
        )

    def send_password_reset_email(self, to_email: str, first_name: str, reset_token: str) -> bool:
        """Send password reset email with a one-click reset link (token-based, 1-hour expiry)"""
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

        html_content = f'''
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 12px 24px; border-radius: 12px;">
                <span style="color: white; font-size: 20px; font-weight: bold;">SkyRate<span style="color: #c4b5fd;">.AI</span></span>
              </div>
            </div>
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="color: #1e293b; margin: 0 0 12px 0; text-align: center;">Reset Your Password</h2>
              <p style="color: #64748b; font-size: 14px; text-align: center; margin: 0 0 24px 0;">
                Hi {first_name}, click the button below to reset your SkyRate AI password.
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="{reset_url}"
                   style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Reset Password
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                Or copy this link: <br>
                <a href="{reset_url}" style="color: #7c3aed; word-break: break-all;">{reset_url}</a>
              </p>
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px;">
                This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </div>
          </div>
        </body>
        </html>
        '''

        return self.send_email(
            to_email=to_email,
            subject="SkyRate AI - Reset Your Password",
            html_content=html_content,
            text_content=f"Hi {first_name}, reset your password: {reset_url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.",
            email_type='noreply'
        )

    def send_identifier_reminder_email(self, to_email: str, first_name: str, magic_token: str, role: str) -> bool:
        """Send a one-click magic-link reminder asking the user to add their CRN/SPIN/BEN.

        Triggered when the user clicks "I'll add it later — remind me by email"
        on onboarding step 0. The link drops them straight back into onboarding
        step 0 with a fresh authenticated session.
        """
        identifier_label = (
            "CRN" if role == "consultant"
            else "SPIN" if role == "vendor"
            else "BEN" if role == "applicant"
            else "USAC ID"
        )
        url = f"{settings.FRONTEND_URL}/onboarding?from=reminder&token={magic_token}"
        html_content = f'''
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="max-width: 540px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 12px 24px; border-radius: 12px;">
                <span style="color: white; font-size: 20px; font-weight: bold;">SkyRate<span style="color: #c4b5fd;">.AI</span></span>
              </div>
            </div>
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="color: #1e293b; margin: 0 0 12px 0;">Hi {first_name},</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                You started a SkyRate AI account but haven&rsquo;t added your <strong>{identifier_label}</strong> yet.
                Your portfolio stays empty until we have it &mdash; this takes about 10 seconds.
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                Click below to pick up where you left off &mdash; you&rsquo;ll be signed straight in:
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="{url}"
                   style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Add my {identifier_label}
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px;">
                This link is single-use and expires in 7 days.
              </p>
            </div>
            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">
              You&rsquo;re receiving this because you asked us to remind you. Reply to unsubscribe.
            </p>
          </div>
        </body>
        </html>
        '''
        text_content = (
            f"Hi {first_name},\n\n"
            f"You started a SkyRate AI account but haven't added your {identifier_label} yet. "
            f"Your portfolio stays empty until we have it.\n\n"
            f"Add it now (signed-in link, expires in 7 days):\n{url}\n\n"
            f"-- SkyRate AI"
        )
        return self.send_email(
            to_email=to_email,
            subject=f"Finish setting up your SkyRate account - add your {identifier_label}",
            html_content=html_content,
            text_content=text_content,
            email_type='noreply',
        )

    def send_winback_email(self, to_email: str, first_name: str, magic_token: str, role: str) -> bool:
        """One-shot win-back to a stranded signup. Used by scripts/winback_send.py.

        Drops the user directly on /onboarding step 0 via a single-use 24-hour
        magic-link. No password required.
        """
        identifier_label = (
            "CRN" if role == "consultant"
            else "SPIN" if role == "vendor"
            else "BEN" if role == "applicant"
            else "USAC ID"
        )
        url = f"{settings.FRONTEND_URL}/onboarding?from=winback&token={magic_token}"
        html_content = f'''
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="max-width: 540px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 12px 24px; border-radius: 12px;">
                <span style="color: white; font-size: 20px; font-weight: bold;">SkyRate<span style="color: #c4b5fd;">.AI</span></span>
              </div>
            </div>
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="color: #1e293b; margin: 0 0 12px 0;">Finish setting up your SkyRate account &mdash; 30 seconds</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Hi {first_name},
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                You created a SkyRate AI account but never finished onboarding. Your portfolio is one number away.
                Add your <strong>{identifier_label}</strong> and we&rsquo;ll auto-pull every E-Rate funding request, deadline, and status alert tied to your entity.
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="{url}"
                   style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Resume onboarding
                </a>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
                The link signs you in automatically &mdash; no password required.
              </p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 16px;">
                Single-use link, expires in 24 hours.
              </p>
            </div>
            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">
              You&rsquo;re receiving this because you signed up at skyrate.ai. Reply to unsubscribe.
            </p>
          </div>
        </body>
        </html>
        '''
        text_content = (
            f"Hi {first_name},\n\n"
            f"You created a SkyRate AI account but never finished onboarding. "
            f"Your portfolio is one number away. Add your {identifier_label} and we'll auto-pull "
            f"every E-Rate funding request, deadline, and status alert tied to your entity.\n\n"
            f"Resume onboarding (signed-in link, expires in 24 hours):\n{url}\n\n"
            f"-- SkyRate AI"
        )
        return self.send_email(
            to_email=to_email,
            subject="Finish setting up your SkyRate account - 30 seconds",
            html_content=html_content,
            text_content=text_content,
            email_type='noreply',
        )


# Convenience function
def get_email_service() -> EmailService:
    return EmailService()
