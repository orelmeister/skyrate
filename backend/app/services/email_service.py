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
    
    # Sender routing by email type
    SENDER_MAP = {
        'alert': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'digest': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'weekly': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
        'deadline': ('alerts@skyrate.ai', 'SkyRate AI Alerts'),
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
            msg['From'] = f"{from_name} <{from_email}>"
            msg['To'] = to_email
            msg['Reply-To'] = f"SkyRate AI Support <support@skyrate.ai>"
            
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
                logger.info(f"Email would be sent to {to_email} from {from_email}: {subject} (SMTP not configured)")
            
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
                    <h1 style="margin: 0; font-size: 24px;">\ud83d\udd14 SkyRate AI Alert</h1>
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
                    <p>\u00a9 {datetime.now().year} SkyRate AI. All rights reserved.</p>
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

View in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard

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
View all in Dashboard: {getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/dashboard
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"[SkyRate AI] Daily Digest - {len(alerts)} alerts",
            html_content=html_content,
            text_content=text_content,
            email_type='digest'
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
                    <p>\u00a9 {datetime.now().year} SkyRate AI. All rights reserved.</p>
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


# Convenience function
def get_email_service() -> EmailService:
    return EmailService()
