"""
SkyRate AI — Email Templates: Entity/Applicant Sequence (4 emails)

Each function returns the plain-text email body with merge fields filled in.
Targets: Schools, Libraries, School Districts that manage their own E-Rate.
"""


def entity_email_1(data: dict) -> str:
    """Day 0 — The Protection Angle"""
    return f"""Hi {data['contact_name']},

I noticed {data['organization_name']} has {data['total_frns']} active FRNs totaling {data['total_funding_committed']} in E-Rate funding. That's significant funding worth protecting.

Quick question — are you currently monitoring your FRN statuses for changes? Denials, commitment adjustments, and rescissions can happen without much warning, and the appeal window is tight.

We built SkyRate AI to catch those changes instantly and notify you via email, push notification, or even text message — within minutes of any USAC action.

Worth a look? https://skyrate.ai

— {data['sender_name']}
{data['signature']}"""


def entity_email_2(data: dict) -> str:
    """Day 4 — The Appeal Safety Net (reply to Email 1)"""
    return f"""Hi {data['contact_name']},

Following up about {data['organization_name']}'s E-Rate monitoring.

Here's a scenario I see too often: an FRN gets denied or has a commitment adjusted to $0, and by the time someone notices, the appeal deadline is dangerously close.

SkyRate AI solves both problems:
1. Instant monitoring — we alert you within minutes of any change
2. AI appeal generator — creates FCC-compliant appeal letters with proper citations in under 60 seconds

With {data['total_funding_committed']} on the line, the peace of mind alone is worth it.

Free trial: https://skyrate.ai

— {data['sender_name']}"""


def entity_email_3(data: dict) -> str:
    """Day 9 — Social Proof"""
    return f"""Hi {data['contact_name']},

Schools and libraries across the country are using AI to monitor their E-Rate applications. Here's why:

- Status changes detected in minutes, not days
- AI-generated appeal letters save 3-4 hours each
- Email + SMS alerts ensure nothing falls through the cracks
- Full portfolio view across all funding years

{data['organization_name']} has {data['total_frns']} FRNs to track. Our AI handles that automatically.

Try it free: https://skyrate.ai

— {data['sender_name']}"""


def entity_email_4(data: dict) -> str:
    """Day 15 — The Breakup"""
    return f"""Hi {data['contact_name']},

I've sent a few notes about protecting {data['organization_name']}'s E-Rate funding with automated monitoring. If it's not a fit right now, I completely understand.

Reply "later" and I'll check in next quarter. Or just let me know and I'll remove you from my list.

Best,
{data['sender_name']}
{data['signature']}"""


# ─── Template Registry ──────────────────────────────────────────
ENTITY_TEMPLATES = {
    "entity_email_1": entity_email_1,
    "entity_email_2": entity_email_2,
    "entity_email_3": entity_email_3,
    "entity_email_4": entity_email_4,
}
