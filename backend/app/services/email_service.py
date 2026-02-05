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
    """Service for sending email notifications"""
    
    def __init__(self):
        self.smtp_host = getattr(settings, 'SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_user = getattr(settings, 'SMTP_USER', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.from_email = getattr(settings, 'FROM_EMAIL', 'alerts@skyrate.io')
        self.from_name = getattr(settings, 'FROM_NAME', 'Skyrate Alerts')
    
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
        text_content: str = None
    ) -> bool:
        """Send an email"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
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
                    server.sendmail(self.from_email, to_email, msg.as_string())
                logger.info(f"Email sent to {to_email}: {subject}")
            else:
                logger.info(f"Email would be sent to {to_email}: {subject} (SMTP not configured)")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    def send_alert_email(self, to_email: str, alert: Alert) -> bool:
        """Send a single alert notification email"""
        priority_colors = {
            AlertPriority.CRITICAL.value: '#dc2626',
            AlertPriority.HIGH.value: '#ea580c',
            AlertPriority.MEDIUM.value: '#ca8a04',
            AlertPriority.LOW.value: '#2563eb',
        }
        
        color = priority_colors.get(alert.priority, '#6b7280')
        
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
                .alert-box {{ background: white; border-left: 4px solid {color}; padding: 15px; margin: 15px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                .priority {{ display: inline-block; background: {color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }}
                .cta-button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">🔔 Skyrate Alert</h1>
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
                    
                    <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard" class="cta-button">
                        View in Dashboard
                    </a>
                </div>
                <div class="footer">
                    <p>You're receiving this because you have email notifications enabled.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>© {datetime.now().year} Skyrate. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
Skyrate Alert

{alert.title}

{alert.message}

Priority: {alert.priority}
{f'Related: {alert.entity_name}' if alert.entity_name else ''}

View in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard

---
To manage your notification preferences, visit: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[Skyrate] {alert.title}",
            html_content=html_content,
            text_content=text_content
        )
    
    def send_digest_email(
        self,
        to_email: str,
        user_name: str,
        alerts: List[Alert]
    ) -> bool:
        """Send daily digest email with multiple alerts"""
        
        # Group alerts by type
        by_type = {}
        for alert in alerts:
            if alert.alert_type not in by_type:
                by_type[alert.alert_type] = []
            by_type[alert.alert_type].append(alert)
        
        # Build alerts HTML
        alerts_html = ""
        for alert_type, type_alerts in by_type.items():
            type_name = alert_type.replace("_", " ").title()
            alerts_html += f'<h3 style="color: #1f2937; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">{type_name} ({len(type_alerts)})</h3>'
            
            for alert in type_alerts[:5]:  # Limit to 5 per type
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">📧 Daily Digest</h1>
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
                    
                    <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard" class="cta-button">
                        View All in Dashboard
                    </a>
                </div>
                <div class="footer">
                    <p>You're receiving this daily digest because you opted in.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>© {datetime.now().year} Skyrate. All rights reserved.</p>
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
View all in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[Skyrate] Daily Digest - {len(alerts)} alerts",
            html_content=html_content,
            text_content=text_content
        )
    
    def send_weekly_summary_email(
        self,
        to_email: str,
        user_name: str,
        summary: Dict[str, Any],
        top_alerts: List[Alert]
    ) -> bool:
        """Send weekly summary email"""
        
        alerts_html = ""
        for alert in top_alerts:
            alerts_html += f"""
            <div style="background: white; border-left: 3px solid #2563eb; padding: 10px 15px; margin: 10px 0; border-radius: 4px;">
                <strong>{alert.title}</strong>
                <span style="color: #6b7280; font-size: 12px; float: right;">{alert.created_at.strftime('%b %d')}</span>
                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">{alert.message[:100]}{'...' if len(alert.message) > 100 else ''}</p>
            </div>
            """
        
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">📊 Weekly Summary</h1>
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
                    {alerts_html}
                    
                    <a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard" class="cta-button">
                        View Dashboard
                    </a>
                </div>
                <div class="footer">
                    <p>You're receiving this weekly summary because you opted in.</p>
                    <p><a href="{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/settings/notifications">Manage notification preferences</a></p>
                    <p>© {datetime.now().year} Skyrate. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
Weekly Summary - Week of {datetime.now().strftime('%B %d, %Y')}

Hi {user_name},

Here's your weekly E-Rate activity summary:

Total Alerts: {summary.get('total_alerts', 0)}
Denials: {summary.get('denials', 0)}
Status Changes: {summary.get('status_changes', 0)}
Deadlines: {summary.get('deadlines', 0)}

View Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[Skyrate] Weekly Summary - {summary.get('total_alerts', 0)} alerts this week",
            html_content=html_content,
            text_content=text_content
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
                    <p>© {datetime.now().year} Skyrate. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"⚠️ [Skyrate] Appeal Deadline: {days_remaining} days left for FRN {frn}",
            html_content=html_content,
            text_content=f"Appeal Deadline Reminder\n\nFRN {frn} ({school_name})\n\n{days_remaining} days remaining\n\nReview your appeal: {appeal_url}"
        )


# Convenience function
def get_email_service() -> EmailService:
    return EmailService()
