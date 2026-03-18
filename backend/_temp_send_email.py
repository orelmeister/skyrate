"""
Temporary one-off script to send Ken a notification that his account is verified.
DO NOT COMMIT. Delete after use.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

if not SMTP_USER or not SMTP_PASSWORD:
    print("[FAIL] SMTP credentials not found in .env")
    exit(1)

TO_EMAIL = "ken@ikonbusinessgroup.com"
SUBJECT = "Your SkyRate AI Account is Ready!"

HTML_CONTENT = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
    .body { padding: 32px 24px; color: #333; line-height: 1.6; }
    .body h2 { color: #7c3aed; font-size: 20px; }
    .cta { display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; color: #888; font-size: 13px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SkyRate AI</h1>
    </div>
    <div class="body">
      <h2>Hi Ken,</h2>
      <p>Great news! Your SkyRate AI account has been verified and is ready to use.</p>
      <p>You can now log in and start exploring E-Rate vendor leads, Form 470 opportunities, and more.</p>
      <p style="text-align: center;">
        <a href="https://skyrate.ai/login" class="cta">Log In to SkyRate AI</a>
      </p>
      <p>If you have any questions or need help getting started, just reply to this email and our team will be happy to assist.</p>
      <p>Welcome aboard!</p>
      <p><strong>The SkyRate AI Team</strong></p>
    </div>
    <div class="footer">
      <p>SkyRate LLC | 30 N Gould St Ste N, Sheridan, WY 82801</p>
      <p><a href="https://skyrate.ai" style="color: #7c3aed;">skyrate.ai</a></p>
    </div>
  </div>
</body>
</html>
"""

TEXT_CONTENT = """Hi Ken,

Great news! Your SkyRate AI account has been verified and is ready to use.

You can now log in at https://skyrate.ai/login and start exploring E-Rate vendor leads, Form 470 opportunities, and more.

If you have any questions or need help getting started, just reply to this email.

Welcome aboard!
The SkyRate AI Team

SkyRate LLC | 30 N Gould St Ste N, Sheridan, WY 82801
https://skyrate.ai
"""

try:
    msg = MIMEMultipart('alternative')
    msg['Subject'] = SUBJECT
    msg['From'] = f"SkyRate AI <{SMTP_USER}>"
    msg['To'] = TO_EMAIL
    msg['Reply-To'] = "support@skyrate.ai"

    msg.attach(MIMEText(TEXT_CONTENT, 'plain'))
    msg.attach(MIMEText(HTML_CONTENT, 'html'))

    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    server.starttls()
    server.login(SMTP_USER, SMTP_PASSWORD)
    server.send_message(msg)
    server.quit()

    print(f"[OK] Notification email sent to {TO_EMAIL}")
except Exception as e:
    print(f"[FAIL] Failed to send email: {e}")
    exit(1)
