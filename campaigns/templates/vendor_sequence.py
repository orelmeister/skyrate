"""
SkyRate AI — Email Templates: Vendor Sequence (4 emails)

Each function returns the plain-text email body with merge fields filled in.
Note: Vendor emails require Hunter.io enrichment first (no emails in raw USAC data).
"""


def vendor_email_1(data: dict) -> str:
    """Day 0 — The Opportunity Alert"""
    return f"""Hi {data['first_name']},

I noticed {data['company_name']} (SPIN #{data['spin']}) is an active E-Rate service provider in {data['state']}.

Quick question — how do you currently find new Form 470 opportunities? Manual USAC searches?

We built SkyRate AI to solve exactly that. Our platform monitors every new Form 470 posting and matches them to your service categories in real-time. You get an alert the moment a school or library posts a bid you should see.

We're in early access for E-Rate vendors. Want to take a look?

https://skyrate.ai

— {data['sender_name']}
{data['signature']}"""


def vendor_email_2(data: dict) -> str:
    """Day 4 — The FOMO (reply to Email 1)"""
    return f"""Hi {data['first_name']},

Following up — here's something that might be useful.

In the last 30 days, schools and libraries in {data['state']} posted new Form 470s for networking, telecom, and IT services. That's potential contracts your team should know about.

How many did {data['company_name']} see?

With SkyRate AI, you'd get notified about each one as it posts — filtered to match your services. Plus competitive intelligence: see who else is bidding and at what price points.

Worth a 5-minute look? https://skyrate.ai

— {data['sender_name']}"""


def vendor_email_3(data: dict) -> str:
    """Day 9 — The Intelligence Play"""
    return f"""Hi {data['first_name']},

One more thing I thought you'd want to know.

We track SPIN-level analytics across the E-Rate program — win rates, competitive landscape, market trends by region and service category.

For vendors like {data['company_name']}, this means:
- See which schools are posting bids matching your services
- Know who your competitors are and what they're winning
- Get alerts when your existing clients post new Form 470s

Early access: $199/month with full competitive intelligence.

Reply if you'd like to see your SPIN dashboard.

— {data['sender_name']}"""


def vendor_email_4(data: dict) -> str:
    """Day 15 — The Breakup"""
    return f"""Hi {data['first_name']},

I reached out about SkyRate AI's vendor tools for E-Rate lead discovery. If it's not the right time, no problem.

Reply "later" and I'll follow up next quarter, or "remove" and I'll take {data['company_name']} off my list.

Best,
{data['sender_name']}
{data['signature']}"""


# ─── Template Registry ──────────────────────────────────────────
VENDOR_TEMPLATES = {
    "vendor_email_1": vendor_email_1,
    "vendor_email_2": vendor_email_2,
    "vendor_email_3": vendor_email_3,
    "vendor_email_4": vendor_email_4,
}
