# mail.skyrate.ai — Subdomain Setup Guide

> **Status:** NOT STARTED — Save for when ready to launch email campaigns.

---

## Why a Subdomain?

Cold outreach goes on `mail.skyrate.ai` to protect `skyrate.ai`'s domain reputation. If spam complaints happen, only the subdomain is affected — your main domain (transactional emails, login, etc.) stays clean.

---

## Step-by-Step Setup

### Step 1: Find Your DNS Provider

Check where `skyrate.ai` nameservers are pointed. This is where you'll add all DNS records.

```bash
nslookup -type=NS skyrate.ai
```

Common options: Cloudflare, Namecheap, GoDaddy, DigitalOcean DNS, etc.

### Step 2: Add `mail.skyrate.ai` in Google Workspace

1. Go to **admin.google.com** → **Account** → **Domains** → **Manage domains**
2. Click **Add a domain**
3. Enter `mail.skyrate.ai`
4. Choose **Secondary domain** (NOT alias)
5. Google gives you a **TXT verification record** — copy it

### Step 3: Add DNS Records

Add these records at your DNS provider for `mail.skyrate.ai`:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| **TXT** | `mail.skyrate.ai` | *(from Google step above)* | Verify ownership |
| **MX** | `mail.skyrate.ai` | `ASPMX.L.GOOGLE.COM` (pri 1), `ALT1.ASPMX.L.GOOGLE.COM` (pri 5), `ALT2.ASPMX.L.GOOGLE.COM` (pri 5) | Route mail |
| **TXT** (SPF) | `mail.skyrate.ai` | `v=spf1 include:_spf.google.com ~all` | Authorize Google to send |
| **TXT** (DMARC) | `_dmarc.mail.skyrate.ai` | `v=DMARC1; p=quarantine; rua=mailto:orel@skyrate.ai` | Anti-spoofing |
| **CNAME** (DKIM) | `google._domainkey.mail.skyrate.ai` | *(generated in Google Admin — see Step 5)* | Email signing |

### Step 4: Verify Domain in Google Admin

After adding the TXT record, go back to Google Admin and click **Verify**. May take up to 48 hours for DNS propagation.

### Step 5: Generate DKIM Key

1. Google Admin → **Apps** → **Google Workspace** → **Gmail** → **Authenticate email**
2. Select `mail.skyrate.ai`
3. Click **Generate new record**
4. Copy the CNAME record → add to DNS
5. Click **Start authentication** once DNS propagates

### Step 6: Create Sending Mailbox

In Google Admin → **Directory** → **Users**:
- Create user `orel@mail.skyrate.ai`
- OR add `orel@mail.skyrate.ai` as an alias to your existing account

### Step 7: Wait & Test

- Wait **24-48 hours** for full DNS propagation
- Send test email from `orel@mail.skyrate.ai` to [mail-tester.com](https://www.mail-tester.com)
- Aim for **9+/10** score
- Check headers for SPF=pass, DKIM=pass, DMARC=pass

---

## After Setup — Gmail API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select project
3. Enable **Gmail API**
4. Create **OAuth 2.0 Client ID** (Desktop application)
5. Download `credentials.json` → save to `campaigns/credentials.json`
6. First run of `email_sender.py` will open browser for OAuth consent
7. Token saved to `campaigns/token.json` (auto-refreshes)

---

## DigitalOcean — Nothing Needed

DigitalOcean App Platform only handles web routing. Email DNS is completely separate.

---

## Checklist

- [ ] Identify DNS provider for skyrate.ai
- [ ] Add mail.skyrate.ai as secondary domain in Google Workspace
- [ ] Add TXT verification record to DNS
- [ ] Verify domain in Google Admin
- [ ] Add MX records
- [ ] Add SPF record
- [ ] Generate and add DKIM record
- [ ] Add DMARC record
- [ ] Create orel@mail.skyrate.ai mailbox
- [ ] Wait 24-48 hours for propagation
- [ ] Test at mail-tester.com (score 9+)
- [ ] Set up Gmail API credentials (credentials.json)
- [ ] Update PHYSICAL_ADDRESS in campaigns/config.py
- [ ] Build /unsubscribe endpoint on skyrate.ai
- [ ] Run first test: `python -m campaigns.prepare_contacts --stats`
