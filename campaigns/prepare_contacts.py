"""
SkyRate AI — Contact Preparation & Import

Reads scraped USAC CSVs, cleans/validates emails, deduplicates,
applies priority scoring, and loads contacts into the campaign database.

Also generates LinkedIn Sales Navigator import CSVs for vendors (no emails).

Usage:
    python -m campaigns.prepare_contacts                # Full import
    python -m campaigns.prepare_contacts --tier consultant  # One tier
    python -m campaigns.prepare_contacts --stats        # Show distribution stats
    python -m campaigns.prepare_contacts --linkedin     # Export vendor LinkedIn CSV
"""

import argparse
import csv
import json
import os
import re
from collections import Counter

from campaigns.config import (
    CONSULTANT_DOMAIN_KEYWORDS,
    CONSULTANT_PRIORITY_RULES,
    CONSULTANTS_CSV,
    ENTITIES_CSV,
    ENTITY_PRIORITY_RULES,
    VENDORS_CSV,
)
from campaigns.email_sender import EmailSender


# ─── Email Validation ────────────────────────────────────────

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

# Throwaway / catch-all / role addresses to skip
SKIP_EMAILS = {
    "info@", "admin@", "webmaster@", "sales@", "support@",
    "noreply@", "no-reply@", "contact@", "hello@",
}

SKIP_DOMAINS = {
    "example.com", "test.com", "localhost", "invalid.com",
}


def validate_email(email: str) -> bool:
    """Check if an email address is valid and worth sending to."""
    if not email or not isinstance(email, str):
        return False
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return False
    domain = email.split("@")[1]
    if domain in SKIP_DOMAINS:
        return False
    # Skip role addresses (usually go to shared inbox or nobody)
    for prefix in SKIP_EMAILS:
        if email.startswith(prefix):
            return False
    return True


def is_consultant_managed_entity(email: str) -> bool:
    """Check if an entity's contact email belongs to a consultant firm."""
    if not email:
        return False
    domain = email.strip().lower().split("@")[-1]
    for keyword in CONSULTANT_DOMAIN_KEYWORDS:
        if keyword in domain:
            return True
    return False


def is_institutional_email(email: str) -> bool:
    """Check if email is from an institutional domain (.edu, .gov, .org, k12)."""
    if not email:
        return False
    domain = email.strip().lower().split("@")[-1]
    return any(ext in domain for ext in [".edu", ".gov", "k12.", ".k12."])


def parse_funding_amount(amount_str: str) -> float:
    """Parse '$47,470.52' into 47470.52"""
    if not amount_str:
        return 0.0
    cleaned = amount_str.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


# ─── Priority Scoring ────────────────────────────────────────

def score_consultant(row: dict) -> int:
    """Calculate priority score for a consultant contact."""
    score = 0
    schools = int(row.get("schools_served", 0) or 0)
    apps = int(row.get("total_applications", 0) or 0)
    year = str(row.get("latest_funding_year", ""))

    if schools >= 50:
        score += CONSULTANT_PRIORITY_RULES["schools_served_50_plus"]
    elif schools >= 10:
        score += CONSULTANT_PRIORITY_RULES["schools_served_10_plus"]

    if year == "2026":
        score += CONSULTANT_PRIORITY_RULES["funding_year_2026"]
    elif year == "2025":
        score += CONSULTANT_PRIORITY_RULES["funding_year_2025"]

    if apps >= 1000:
        score += CONSULTANT_PRIORITY_RULES["total_applications_1000_plus"]

    return score


def score_entity(row: dict) -> int:
    """Calculate priority score for an entity contact."""
    score = 0
    email = (row.get("contact_email", "") or "").strip().lower()
    year = str(row.get("latest_funding_year", ""))
    funding = parse_funding_amount(row.get("total_funding_committed", ""))
    frns = int(row.get("total_frns", 0) or 0)

    if is_institutional_email(email):
        score += ENTITY_PRIORITY_RULES["institutional_email"]

    if year == "2026":
        score += ENTITY_PRIORITY_RULES["funding_year_2026"]
    elif year == "2025":
        score += ENTITY_PRIORITY_RULES["funding_year_2025"]

    if funding >= 100_000:
        score += ENTITY_PRIORITY_RULES["funding_over_100k"]
    elif funding >= 50_000:
        score += ENTITY_PRIORITY_RULES["funding_over_50k"]

    if frns >= 3:
        score += ENTITY_PRIORITY_RULES["multiple_frns"]

    return score


# ─── CSV Loading ─────────────────────────────────────────────

def load_consultants(filepath: str) -> list[dict]:
    """Load and clean consultant contacts from CSV."""
    contacts = []
    seen_emails = set()

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get("email", "") or "").strip().lower()
            if not validate_email(email):
                continue
            if email in seen_emails:
                continue
            seen_emails.add(email)

            name = row.get("consultant_name", "").strip()
            # Try to extract first name from consultant name
            first_name = name.split()[0] if name else ""
            # If company name (not a person), use generic
            if any(kw in name.lower() for kw in ["inc", "llc", "corp", "consult", "group", "services"]):
                first_name = ""

            contacts.append({
                "email": email,
                "first_name": first_name or "there",
                "last_name": "",
                "organization": name,
                "tier": "consultant",
                "state": row.get("state", ""),
                "priority_score": score_consultant(row),
                "extra_data": json.dumps({
                    "crn": row.get("crn", ""),
                    "schools_served": row.get("schools_served", ""),
                    "total_applications": row.get("total_applications", ""),
                    "latest_funding_year": row.get("latest_funding_year", ""),
                    "phone": row.get("phone", ""),
                }),
            })

    return contacts


def load_entities(filepath: str) -> list[dict]:
    """Load and clean entity contacts from CSV, excluding consultant-managed."""
    contacts = []
    seen_emails = set()
    stats = Counter()

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            stats["total"] += 1
            email = (row.get("contact_email", "") or "").strip().lower()

            if not validate_email(email):
                stats["invalid_email"] += 1
                continue

            if is_consultant_managed_entity(email):
                stats["consultant_managed"] += 1
                continue

            if email in seen_emails:
                stats["duplicate"] += 1
                continue
            seen_emails.add(email)

            contact_name = (row.get("contact_name", "") or "").strip()
            first_name = contact_name.split()[0] if contact_name else ""

            funding = row.get("total_funding_committed", "")
            frns = row.get("total_frns", "")

            contacts.append({
                "email": email,
                "first_name": first_name or "there",
                "last_name": " ".join(contact_name.split()[1:]) if contact_name else "",
                "organization": row.get("organization_name", "").strip(),
                "tier": "entity",
                "state": row.get("state", ""),
                "priority_score": score_entity(row),
                "extra_data": json.dumps({
                    "ben": row.get("ben", ""),
                    "entity_type": row.get("entity_type", "School"),
                    "total_frns": frns,
                    "total_funding_committed": funding,
                    "latest_funding_year": row.get("latest_funding_year", ""),
                }),
            })

    print(f"  Entity stats: {dict(stats)}")
    return contacts


def load_vendors(filepath: str) -> list[dict]:
    """
    Load vendors from CSV.
    NOTE: Vendors have NO email addresses — this loads for reference only.
    Email enrichment via Hunter.io must be done separately.
    """
    contacts = []

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = (row.get("status", "") or "").strip()
            if status.lower() != "active":
                continue  # Only target active SPINs

            contacts.append({
                "email": "",  # Will be populated by Hunter.io enrichment
                "first_name": "",
                "last_name": "",
                "organization": row.get("company_name", "").strip(),
                "tier": "vendor",
                "state": row.get("physical_state", "") or row.get("mailing_state", ""),
                "priority_score": 0,
                "extra_data": json.dumps({
                    "spin": row.get("spin", ""),
                    "phone": row.get("phone", ""),
                    "mailing_city": row.get("mailing_city", ""),
                    "physical_city": row.get("physical_city", ""),
                }),
            })

    return contacts


# ─── Import to Database ─────────────────────────────────────

def import_contacts(sender: EmailSender, contacts: list[dict], tier: str):
    """Import contacts list into campaign database."""
    added = 0
    skipped = 0

    for c in contacts:
        if not c["email"]:
            skipped += 1
            continue

        result = sender.add_contact(
            email=c["email"],
            first_name=c["first_name"],
            last_name=c["last_name"],
            organization=c["organization"],
            tier=c["tier"],
            state=c["state"],
            priority_score=c["priority_score"],
            extra_data=c["extra_data"],
        )

        if result:
            added += 1
        else:
            skipped += 1

    print(f"  [{tier.upper()}] Imported: {added}, Skipped: {skipped}")


# ─── LinkedIn Export ─────────────────────────────────────────

def export_vendor_linkedin_csv(filepath: str, output_path: str):
    """
    Export top vendors as a CSV for LinkedIn Sales Navigator import.

    Columns: Company Name, Location, SPIN (for reference)
    """
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)

    vendors = load_vendors(filepath)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Company Name", "City", "State", "SPIN", "Phone"])

        for v in vendors:
            extra = json.loads(v["extra_data"])
            writer.writerow([
                v["organization"],
                extra.get("physical_city", ""),
                v["state"],
                extra.get("spin", ""),
                extra.get("phone", ""),
            ])

    print(f"  LinkedIn vendor export: {len(vendors)} records → {output_path}")


# ─── Stats ───────────────────────────────────────────────────

def show_stats():
    """Show contact distribution statistics without importing."""
    print("\n" + "=" * 60)
    print("  Contact Database Statistics")
    print("=" * 60)

    # Consultants
    consultants = load_consultants(CONSULTANTS_CSV)
    print(f"\n  CONSULTANTS: {len(consultants)} valid contacts")
    if consultants:
        scores = [c["priority_score"] for c in consultants]
        print(f"    Priority scores: min={min(scores)}, max={max(scores)}, avg={sum(scores)/len(scores):.0f}")
        states = Counter(c["state"] for c in consultants)
        print(f"    Top states: {states.most_common(5)}")

    # Entities
    entities = load_entities(ENTITIES_CSV)
    print(f"\n  ENTITIES: {len(entities)} valid direct contacts")
    if entities:
        scores = [c["priority_score"] for c in entities]
        print(f"    Priority scores: min={min(scores)}, max={max(scores)}, avg={sum(scores)/len(scores):.0f}")
        states = Counter(c["state"] for c in entities)
        print(f"    Top states: {states.most_common(5)}")
        institutional = sum(1 for e in entities if is_institutional_email(e["email"]))
        print(f"    Institutional emails: {institutional}")

    # Vendors
    print(f"\n  VENDORS: (no emails — LinkedIn only)")
    vendors = load_vendors(VENDORS_CSV)
    print(f"    Active vendors: {len(vendors)}")
    states = Counter(v["state"] for v in vendors)
    print(f"    Top states: {states.most_common(5)}")

    print(f"\n  TOTAL TARGETABLE CONTACTS: {len(consultants) + len(entities)}")
    print("=" * 60 + "\n")


# ─── CLI ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SkyRate Contact Preparation")
    parser.add_argument("--tier", choices=["consultant", "vendor", "entity"], help="Import specific tier only")
    parser.add_argument("--stats", action="store_true", help="Show stats without importing")
    parser.add_argument("--linkedin", action="store_true", help="Export vendor LinkedIn CSV")
    args = parser.parse_args()

    if args.stats:
        show_stats()
        return

    if args.linkedin:
        output = os.path.join(os.path.dirname(__file__), "data", "vendor_linkedin_export.csv")
        export_vendor_linkedin_csv(VENDORS_CSV, output)
        return

    # Full import
    sender = EmailSender()
    sender.initialize()

    tiers = [args.tier] if args.tier else ["consultant", "entity"]  # Skip vendor (no emails)

    for tier in tiers:
        print(f"\nLoading {tier} contacts...")
        if tier == "consultant":
            contacts = load_consultants(CONSULTANTS_CSV)
        elif tier == "entity":
            contacts = load_entities(ENTITIES_CSV)
        elif tier == "vendor":
            contacts = load_vendors(VENDORS_CSV)
        else:
            continue

        import_contacts(sender, contacts, tier)

    sender.print_summary()
    sender.close()

    print("\nDone. Run `python -m campaigns.campaign_manager --dry-run` to preview sends.")


if __name__ == "__main__":
    main()
