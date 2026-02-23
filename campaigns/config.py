"""
SkyRate AI — Campaign Configuration

Defines warmup schedules, daily limits, campaign sequences, and timing rules.
"""

import os
from datetime import time

# ─── Sending Identity ────────────────────────────────────────────
SENDER_NAME = "Orel Meister"
SENDER_EMAIL = os.getenv("CAMPAIGN_SENDER_EMAIL", "orel@mail.skyrate.ai")
COMPANY_NAME = "SkyRate AI"
COMPANY_URL = "https://skyrate.ai"
PHYSICAL_ADDRESS = os.getenv("CAMPAIGN_PHYSICAL_ADDRESS", "SkyRate AI, [Your Address], [City, State ZIP]")
UNSUBSCRIBE_BASE_URL = f"{COMPANY_URL}/unsubscribe"

# ─── Gmail API ───────────────────────────────────────────────────
GMAIL_CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")
GMAIL_TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.json")
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]

# ─── Database ────────────────────────────────────────────────────
CAMPAIGN_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "campaign.db")

# ─── Source Data ─────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "scraped_data")
CONSULTANTS_CSV = os.path.join(DATA_DIR, "usac_consultants.csv")
VENDORS_CSV = os.path.join(DATA_DIR, "usac_vendors.csv")
ENTITIES_CSV = os.path.join(DATA_DIR, "usac_entities.csv")

# ─── Warmup Schedule ────────────────────────────────────────────
# Each entry: (day_range_start, day_range_end, max_emails_per_day)
# Day 1 = first day of campaign
WARMUP_SCHEDULE = [
    (1, 2, 3),      # Day 1-2: 3 emails/day
    (3, 4, 5),      # Day 3-4: 5 emails/day
    (5, 7, 8),      # Day 5-7: 8 emails/day
    (8, 10, 12),    # Day 8-10: 12 emails/day
    (11, 14, 15),   # Day 11-14: 15 emails/day
    (15, 21, 20),   # Day 15-21: 20 emails/day
    (22, 30, 30),   # Day 22-30: 30 emails/day
    (31, 9999, 50), # Day 31+: 50 emails/day (cruise speed)
]

# ─── Sending Windows (recipient local time) ──────────────────────
# Emails are only sent during these windows
SEND_WINDOWS = [
    (time(8, 0), time(10, 30)),   # Morning window: 8:00 AM - 10:30 AM
    (time(13, 0), time(14, 30)),  # Afternoon window: 1:00 PM - 2:30 PM
]

# ─── Timing ──────────────────────────────────────────────────────
MIN_DELAY_BETWEEN_EMAILS_SEC = 45   # Minimum seconds between sends
MAX_DELAY_BETWEEN_EMAILS_SEC = 120  # Maximum seconds between sends
JITTER_MINUTES = 15                  # ±15 min randomization on send time

# Days of week allowed (0=Monday, 6=Sunday)
# During warmup (first 14 days): weekdays only
# After warmup: weekdays + Saturday morning
WARMUP_SEND_DAYS = [0, 1, 2, 3, 4]       # Mon-Fri
CRUISE_SEND_DAYS = [0, 1, 2, 3, 4, 5]    # Mon-Sat

# ─── Kill Switches ──────────────────────────────────────────────
MAX_BOUNCE_RATE = 0.03          # 3% — pause campaign if exceeded
MAX_SPAM_COMPLAINT_RATE = 0.001 # 0.1% — STOP campaign immediately
MAX_CONSECUTIVE_BOUNCES = 5     # Pause after 5 bounces in a row
MIN_OPEN_RATE_3DAY = 0.10       # 10% — if below for 3 days, likely in spam

# ─── Campaign Sequences ─────────────────────────────────────────
# Define the email sequence for each tier
# Each step: (step_number, days_after_previous, template_function_name, is_reply)

CONSULTANT_SEQUENCE = [
    {"step": 1, "delay_days": 0,  "template": "consultant_email_1", "is_reply": False, "subject": "Quick question about {consultant_name}"},
    {"step": 2, "delay_days": 3,  "template": "consultant_email_2", "is_reply": True,  "subject": "Re: Quick question about {consultant_name}"},
    {"step": 3, "delay_days": 4,  "template": "consultant_email_3", "is_reply": False, "subject": "How E-Rate consultants are saving 40+ hours/month"},
    {"step": 4, "delay_days": 5,  "template": "consultant_email_4", "is_reply": False, "subject": "Early access pricing for E-Rate consultants"},
    {"step": 5, "delay_days": 6,  "template": "consultant_email_5", "is_reply": False, "subject": "Should I close your file?"},
]

VENDOR_SEQUENCE = [
    {"step": 1, "delay_days": 0,  "template": "vendor_email_1", "is_reply": False, "subject": "New Form 470 leads for {company_name}"},
    {"step": 2, "delay_days": 4,  "template": "vendor_email_2", "is_reply": True,  "subject": "Re: New Form 470 leads for {company_name}"},
    {"step": 3, "delay_days": 5,  "template": "vendor_email_3", "is_reply": False, "subject": "SPIN #{spin} — your competitive landscape"},
    {"step": 4, "delay_days": 6,  "template": "vendor_email_4", "is_reply": False, "subject": "Not the right time?"},
]

ENTITY_SEQUENCE = [
    {"step": 1, "delay_days": 0,  "template": "entity_email_1", "is_reply": False, "subject": "Protecting {organization_name}'s E-Rate funding"},
    {"step": 2, "delay_days": 4,  "template": "entity_email_2", "is_reply": True,  "subject": "Re: Protecting {organization_name}'s E-Rate funding"},
    {"step": 3, "delay_days": 5,  "template": "entity_email_3", "is_reply": False, "subject": "How {entity_type}s protect their E-Rate funding"},
    {"step": 4, "delay_days": 6,  "template": "entity_email_4", "is_reply": False, "subject": "Should I stop reaching out?"},
]

# ─── Daily Tier Distribution (Post-Warmup) ───────────────────────
# How to split daily email quota across tiers
# Proportions (must sum to 1.0)
TIER_DISTRIBUTION = {
    "consultant": 0.25,  # 25% of daily quota
    "entity": 0.60,      # 60% of daily quota
    "vendor": 0.15,      # 15% of daily quota (limited by available emails)
}

# ─── Priority Scoring ───────────────────────────────────────────
# Higher score = higher priority for sending first

CONSULTANT_PRIORITY_RULES = {
    "schools_served_50_plus": 30,     # Large portfolio
    "schools_served_10_plus": 15,     # Mid-size portfolio
    "funding_year_2026": 20,          # Current year
    "funding_year_2025": 10,          # Recent year
    "total_applications_1000_plus": 10, # Very active
}

ENTITY_PRIORITY_RULES = {
    "institutional_email": 25,        # .edu, .org, .gov, k12
    "funding_year_2026": 20,          # Current year
    "funding_year_2025": 10,          # Recent year
    "funding_over_50k": 15,           # Significant funding at stake
    "funding_over_100k": 25,          # Major funding at stake
    "multiple_frns": 10,              # More FRNs = more to monitor
}

# ─── Consultant Email Domains to Exclude from Entity List ────────
# These domains belong to consultant firms — entities with these
# contact emails are consultant-managed and should not receive
# the entity campaign (the consultant handles their E-Rate)
CONSULTANT_DOMAIN_KEYWORDS = [
    "consult", "erate", "e-rate", "kellogg", "comaudit",
    "elitefund", "infinitycomm", "csmcentral", "ocerate",
    "smserate", "erateportal", "erateprogram", "erateadvantage",
    "erateexchange", "eratespecialist", "eratesolutions",
    "eratesupport", "adtecerate", "e-ratecentral", "crwconsulting",
]

# ─── State to Timezone Mapping ──────────────────────────────────
STATE_TIMEZONES = {
    "AL": "US/Central", "AK": "US/Alaska", "AZ": "US/Arizona",
    "AR": "US/Central", "CA": "US/Pacific", "CO": "US/Mountain",
    "CT": "US/Eastern", "DE": "US/Eastern", "FL": "US/Eastern",
    "GA": "US/Eastern", "HI": "US/Hawaii", "ID": "US/Mountain",
    "IL": "US/Central", "IN": "US/Eastern", "IA": "US/Central",
    "KS": "US/Central", "KY": "US/Eastern", "LA": "US/Central",
    "ME": "US/Eastern", "MD": "US/Eastern", "MA": "US/Eastern",
    "MI": "US/Eastern", "MN": "US/Central", "MS": "US/Central",
    "MO": "US/Central", "MT": "US/Mountain", "NE": "US/Central",
    "NV": "US/Pacific", "NH": "US/Eastern", "NJ": "US/Eastern",
    "NM": "US/Mountain", "NY": "US/Eastern", "NC": "US/Eastern",
    "ND": "US/Central", "OH": "US/Eastern", "OK": "US/Central",
    "OR": "US/Pacific", "PA": "US/Eastern", "RI": "US/Eastern",
    "SC": "US/Eastern", "SD": "US/Central", "TN": "US/Central",
    "TX": "US/Central", "UT": "US/Mountain", "VT": "US/Eastern",
    "VA": "US/Eastern", "WA": "US/Pacific", "WV": "US/Eastern",
    "WI": "US/Central", "WY": "US/Mountain", "DC": "US/Eastern",
    # Territories
    "PR": "America/Puerto_Rico", "GU": "Pacific/Guam",
    "VI": "America/Virgin", "AS": "US/Samoa", "MP": "Pacific/Guam",
}
