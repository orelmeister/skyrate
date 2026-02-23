"""
SkyRate AI — Email Templates: Consultant Sequence (5 emails)

Each function returns the plain-text email body with merge fields filled in.
"""


def consultant_email_1(data: dict) -> str:
    """Day 0 — The Question"""
    return f"""Hi {data['first_name']},

I came across {data['consultant_name']} while researching E-Rate consultants serving schools in {data['state']}. Managing applications for {data['schools_served']} schools is no small task.

Quick question — how do you currently track FRN status changes across your portfolio? Is it mostly manual USAC lookups?

We built SkyRate AI specifically to automate that. Real-time FRN monitoring with instant alerts when anything changes — denials, commitment adjustments, status updates.

Curious if that's something you'd find useful?

Best,
{data['sender_name']}
{data['signature']}"""


def consultant_email_2(data: dict) -> str:
    """Day 3 — The Value Drop (reply to Email 1)"""
    return f"""Hi {data['first_name']},

Following up — one thing I should've mentioned.

Our AI doesn't just monitor FRNs. When a denial or commitment adjustment hits, it automatically generates a complete appeal letter with FCC citations, precedents, and case-specific arguments.

Last month alone, we detected dozens of FRN status changes in {data['state']}. That's a lot of USAC tabs to keep open.

Here's what the dashboard looks like for consultants:
https://skyrate.ai

Happy to do a 5-minute walkthrough if helpful.

— {data['sender_name']}"""


def consultant_email_3(data: dict) -> str:
    """Day 7 — The Social Proof"""
    return f"""Hi {data['first_name']},

One more thought for you.

An E-Rate consultant managing 200+ schools told us they were spending 15+ hours/week just checking USAC for status changes. After setting up SkyRate AI's FRN monitoring, they cut that to under an hour.

The AI appeal generator has been the other big win — generating FCC-compliant appeal letters in under 60 seconds instead of 3-4 hours of manual drafting.

With {data['schools_served']} schools in your portfolio, similar time savings would free up meaningful capacity.

Free trial available — no credit card needed: https://skyrate.ai

— {data['sender_name']}"""


def consultant_email_4(data: dict) -> str:
    """Day 12 — The Exclusivity"""
    return f"""Hi {data['first_name']},

We're wrapping up our early-access period for E-Rate consultants by the end of this month.

Current pricing for consultants:
- Real-time FRN monitoring for your entire portfolio
- AI-powered appeal generation (denial + commitment adjustments)
- Email, SMS, and push notifications on status changes
- All for $300/month (or $3,000/year — saves $600)

After early access ends, pricing goes up. Wanted to make sure {data['consultant_name']} had the option before then.

Reply "interested" and I'll send you login credentials to try it.

— {data['sender_name']}"""


def consultant_email_5(data: dict) -> str:
    """Day 18 — The Breakup"""
    return f"""Hi {data['first_name']},

I know managing E-Rate applications for {data['schools_served']} schools keeps you busy, so I'll keep this short.

I've reached out a few times about SkyRate AI's monitoring and appeal tools. If the timing isn't right, no worries at all.

Just reply:
- "Later" — I'll check back next quarter
- "No thanks" — I'll remove you from my list
- "Tell me more" — I'll send a demo link

Either way, I appreciate your time.

Best,
{data['sender_name']}
{data['signature']}"""


# ─── Template Registry ──────────────────────────────────────────
CONSULTANT_TEMPLATES = {
    "consultant_email_1": consultant_email_1,
    "consultant_email_2": consultant_email_2,
    "consultant_email_3": consultant_email_3,
    "consultant_email_4": consultant_email_4,
    "consultant_email_5": consultant_email_5,
}
