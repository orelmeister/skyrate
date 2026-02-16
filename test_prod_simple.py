"""Quick production test - writes results to file"""
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

results = []
API = "https://skyrate.ai/api/v1"

# 1. Test login
results.append("=" * 50)
results.append("1. Testing production login...")
try:
    r = requests.post(f"{API}/auth/login", json={
        "email": "test_consultant@example.com",
        "password": "TestPass123!"
    }, timeout=15)
    results.append(f"   Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        results.append(f"   Token: {data.get('access_token', '')[:30]}...")
        results.append(f"   User: {data.get('user', {}).get('email')}")
        results.append(f"   Role: {data.get('user', {}).get('role')}")
    else:
        results.append(f"   Response: {r.text[:200]}")
except Exception as e:
    results.append(f"   ERROR: {e}")

# 2. Test email
results.append("\n" + "=" * 50)
results.append("2. Testing SMTP email...")
try:
    msg = MIMEMultipart('alternative')
    msg['Subject'] = '[SkyRate AI] Email System Test'
    msg['From'] = 'SkyRate AI Alerts <alerts@skyrate.ai>'
    msg['To'] = 'david@skyrate.ai'
    
    html = "<html><body><h1>SkyRate AI Email Test</h1><p>Email system is working!</p></body></html>"
    msg.attach(MIMEText("Email test", 'plain'))
    msg.attach(MIMEText(html, 'html'))
    
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login('david@skyrate.ai', 'lwqrksgqwubqrpqz')
    server.sendmail('alerts@skyrate.ai', 'david@skyrate.ai', msg.as_string())
    server.quit()
    results.append("   SUCCESS: Email sent to david@skyrate.ai")
except Exception as e:
    results.append(f"   FAILED: {e}")

# Write results
with open("c:/Dev/skyrate/test_results.txt", "w") as f:
    f.write("\n".join(results))
