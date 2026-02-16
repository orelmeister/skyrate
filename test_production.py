"""Quick production test - email + API verification"""
import requests
import json

API = "https://skyrate.ai/api/v1"

# 1. Test login
print("=" * 50)
print("1. Testing production login...")
try:
    r = requests.post(f"{API}/auth/login", json={
        "email": "test_consultant@example.com",
        "password": "TestPass123!"
    }, timeout=15)
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        token = data.get("access_token", "")
        print(f"   Token: {token[:30]}...")
        print(f"   User: {data.get('user', {}).get('email')}")
        print(f"   Role: {data.get('user', {}).get('role')}")
    else:
        print(f"   Response: {r.text[:200]}")
        token = None
except Exception as e:
    print(f"   ERROR: {e}")
    token = None

# 2. Test email sending via SMTP directly
print("\n" + "=" * 50)
print("2. Testing SMTP email sending...")
try:
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    msg = MIMEMultipart('alternative')
    msg['Subject'] = '[SkyRate AI] Email System Test'
    msg['From'] = 'SkyRate AI Alerts <alerts@skyrate.ai>'
    msg['To'] = 'david@skyrate.ai'
    msg['Reply-To'] = 'SkyRate AI Support <support@skyrate.ai>'
    
    html = """
    <html><body style="font-family: Arial, sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:white;padding:20px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;">✅ SkyRate AI Email Test</h1>
        </div>
        <div style="background:#f8fafc;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p>This is a test email from the SkyRate AI email system.</p>
            <p><strong>SMTP:</strong> smtp.gmail.com:587</p>
            <p><strong>From:</strong> alerts@skyrate.ai</p>
            <p><strong>Auth:</strong> david@skyrate.ai via App Password</p>
            <p style="color:#16a34a;font-weight:bold;">✅ If you received this, the email system is working!</p>
        </div>
        <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:20px;">
            © 2026 SkyRate AI. All rights reserved.
        </p>
    </div>
    </body></html>
    """
    
    msg.attach(MIMEText("SkyRate AI Email Test - If you received this, email is working!", 'plain'))
    msg.attach(MIMEText(html, 'html'))
    
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login('david@skyrate.ai', 'lwqrksgqwubqrpqz')
    server.sendmail('alerts@skyrate.ai', 'david@skyrate.ai', msg.as_string())
    server.quit()
    print("   ✅ Email sent successfully to david@skyrate.ai!")
except Exception as e:
    print(f"   ❌ Email failed: {e}")

print("\n" + "=" * 50)
print("Done!")
