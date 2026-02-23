"""
SkyRate AI — Campaign Manager (Orchestration Engine)

Coordinates daily email sends across all three tiers:
- Loads contacts from SQLite
- Determines which sequence step each contact is on
- Respects warmup schedule, daily limits, tier distribution
- Runs the daily send loop with delays and kill switches
- Generates end-of-day reports

Usage:
    python -m campaigns.campaign_manager
    python -m campaigns.campaign_manager --dry-run
    python -m campaigns.campaign_manager --report
"""

import argparse
import json
import random
import sys
from datetime import datetime, timedelta
from typing import Optional

from campaigns.config import (
    CONSULTANT_SEQUENCE,
    CRUISE_SEND_DAYS,
    ENTITY_SEQUENCE,
    JITTER_MINUTES,
    SENDER_NAME,
    TIER_DISTRIBUTION,
    VENDOR_SEQUENCE,
    WARMUP_SEND_DAYS,
)
from campaigns.email_sender import EmailSender
from campaigns.templates import ALL_TEMPLATES


# ─── Sequence Lookup ─────────────────────────────────────────

SEQUENCES = {
    "consultant": CONSULTANT_SEQUENCE,
    "vendor": VENDOR_SEQUENCE,
    "entity": ENTITY_SEQUENCE,
}


class CampaignManager:
    """Orchestrates daily campaign sends across all tiers."""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.sender = EmailSender()
        self._sends_this_run = 0

    def initialize(self):
        """Set up sender and verify readiness."""
        self.sender.initialize()
        summary = self.sender.get_campaign_summary()

        print(f"\n[CampaignManager] Campaign Day {summary['campaign_day']}")
        print(f"[CampaignManager] Daily limit: {summary['daily_limit']}")
        print(f"[CampaignManager] Already sent today: {summary['sends_today']}")
        print(f"[CampaignManager] Remaining: {summary['remaining_today']}")

        if self.dry_run:
            print("[CampaignManager] *** DRY RUN MODE — no emails will be sent ***")

    # ─── Day-of-Week Check ───────────────────────────────

    def is_send_day(self) -> bool:
        """Check if today is an allowed sending day."""
        today = datetime.now().weekday()
        campaign_day = self.sender.get_campaign_day()

        if campaign_day <= 14:
            allowed = WARMUP_SEND_DAYS
        else:
            allowed = CRUISE_SEND_DAYS

        if today not in allowed:
            day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            print(f"[CampaignManager] Today is {day_names[today]} — not a send day")
            return False
        return True

    # ─── Determine Next Step for a Contact ───────────────

    def get_next_step(self, contact: dict) -> Optional[dict]:
        """
        Determine the next sequence step for a contact.

        Returns the sequence step dict or None if:
        - Contact has completed the sequence
        - It's too early for the next step (delay hasn't elapsed)
        """
        tier = contact["tier"]
        sequence = SEQUENCES.get(tier, [])
        contact_id = contact["id"]

        # Get all sends for this contact
        sends = self.sender.db_conn.execute(
            "SELECT * FROM sends WHERE contact_id = ? ORDER BY sequence_step ASC",
            (contact_id,),
        ).fetchall()

        if not sends:
            # No sends yet — start at step 1
            return sequence[0] if sequence else None

        last_send = sends[-1]
        last_step = last_send["sequence_step"]
        last_sent_at = datetime.fromisoformat(last_send["sent_at"])

        # Find next step in sequence
        next_step = None
        for step in sequence:
            if step["step"] == last_step + 1:
                next_step = step
                break

        if not next_step:
            return None  # Sequence complete

        # Check delay
        required_delay = timedelta(days=next_step["delay_days"])
        if datetime.now() - last_sent_at < required_delay:
            return None  # Too early

        return next_step

    def get_thread_id(self, contact_id: int) -> Optional[str]:
        """Get the Gmail thread ID from the first send (for reply threading)."""
        row = self.sender.db_conn.execute(
            "SELECT thread_id FROM sends WHERE contact_id = ? AND sequence_step = 1",
            (contact_id,),
        ).fetchone()
        return row["thread_id"] if row else None

    # ─── Build Send Queue ────────────────────────────────

    def build_send_queue(self) -> list[dict]:
        """
        Build today's send queue respecting tier distribution and daily limits.

        Returns a list of dicts: {contact, step, tier}
        """
        daily_limit = self.sender.get_daily_limit()
        already_sent = self.sender.get_sends_today()
        remaining = max(0, daily_limit - already_sent)

        if remaining == 0:
            print("[CampaignManager] No sends remaining today")
            return []

        queue = []

        # Calculate per-tier quotas
        tier_quotas = {}
        for tier, pct in TIER_DISTRIBUTION.items():
            tier_quotas[tier] = max(1, int(remaining * pct))

        print(f"[CampaignManager] Tier quotas: {tier_quotas}")

        # Gather eligible contacts per tier
        for tier, quota in tier_quotas.items():
            contacts = self.sender.get_contacts_for_tier(tier, limit=quota * 3)

            added = 0
            for contact in contacts:
                if added >= quota:
                    break

                step = self.get_next_step(contact)
                if step:
                    queue.append({
                        "contact": contact,
                        "step": step,
                        "tier": tier,
                    })
                    added += 1

            print(f"  {tier}: {added}/{quota} contacts queued")

        # Shuffle to avoid all same-tier emails in sequence
        random.shuffle(queue)

        # Trim to remaining limit
        return queue[:remaining]

    # ─── Execute Sends ───────────────────────────────────

    def _build_merge_data(self, contact: dict) -> dict:
        """Build merge field data dict for templates."""
        extra = json.loads(contact.get("extra_data", "{}") or "{}")

        base = {
            "sender_name": SENDER_NAME,
            "signature": f"{SENDER_NAME}\nSkyRate AI\nhttps://skyrate.ai",
            "first_name": contact.get("first_name", "there"),
            "state": contact.get("state", ""),
        }

        tier = contact["tier"]

        if tier == "consultant":
            base.update({
                "consultant_name": contact.get("organization", "your firm"),
                "schools_served": extra.get("schools_served", ""),
            })
        elif tier == "vendor":
            base.update({
                "company_name": contact.get("organization", "your company"),
                "spin": extra.get("spin", ""),
            })
        elif tier == "entity":
            base.update({
                "contact_name": contact.get("first_name", "there"),
                "organization_name": contact.get("organization", "your organization"),
                "entity_type": extra.get("entity_type", "School"),
                "total_frns": extra.get("total_frns", "several"),
                "total_funding_committed": extra.get("total_funding_committed", "significant"),
            })

        return base

    def _render_subject(self, subject_template: str, data: dict) -> str:
        """Render merge fields in subject line."""
        result = subject_template
        for key, value in data.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result

    def run_daily(self):
        """Execute the daily campaign send loop."""
        print(f"\n{'='*60}")
        print(f"  SkyRate Campaign Run — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print(f"{'='*60}\n")

        if not self.is_send_day():
            return

        self.sender.print_summary()

        # Build queue
        queue = self.build_send_queue()
        if not queue:
            print("[CampaignManager] Nothing to send today")
            return

        print(f"\n[CampaignManager] Sending {len(queue)} emails...\n")

        for i, item in enumerate(queue, 1):
            contact = item["contact"]
            step = item["step"]
            tier = item["tier"]

            # Safety check
            allowed, reason = self.sender.can_send()
            if not allowed:
                print(f"\n[HALT] {reason} — stopping run")
                break

            # Build template data
            data = self._build_merge_data(contact)

            # Render template
            template_fn = ALL_TEMPLATES.get(tier, {}).get(step["template"])
            if not template_fn:
                print(f"  [SKIP] Template not found: {tier}/{step['template']}")
                continue

            body = template_fn(data)
            subject = self._render_subject(step["subject"], data)

            # Thread management
            is_reply = step.get("is_reply", False)
            thread_id = self.get_thread_id(contact["id"]) if is_reply else None

            print(f"\n[{i}/{len(queue)}] {tier.upper()} | {contact['email']} | Step {step['step']}")

            if self.dry_run:
                print(f"  [DRY RUN] Would send: \"{subject}\"")
                print(f"  [DRY RUN] Template: {step['template']}")
                self._sends_this_run += 1
                continue

            # Send with delay
            result = self.sender.send_with_delay(
                contact_id=contact["id"],
                to_email=contact["email"],
                subject=subject,
                body=body,
                template_name=step["template"],
                sequence_step=step["step"],
                is_reply=is_reply,
                thread_id=thread_id,
            )

            if result:
                self._sends_this_run += 1

        # End-of-run report
        print(f"\n{'='*60}")
        print(f"  Run Complete — {self._sends_this_run} emails {'would be ' if self.dry_run else ''}sent")
        print(f"{'='*60}")
        self.sender.print_summary()

    # ─── Reporting ───────────────────────────────────────

    def print_full_report(self):
        """Print comprehensive campaign report."""
        summary = self.sender.get_campaign_summary()

        print(f"\n{'='*60}")
        print(f"  SkyRate Campaign Report — Day {summary['campaign_day']}")
        print(f"{'='*60}")
        print(f"\n  Overall Stats:")
        print(f"    Contacts reached: {summary.get('total_contacts_reached', 0)}")
        print(f"    Total sends:      {summary.get('total_sends', 0)}")
        print(f"    Total bounces:    {summary.get('total_bounces', 0)}")
        print(f"    Total opens:      {summary.get('total_opens', 0)}")
        print(f"    Unsubscribes:     {summary['total_unsubscribes']}")

        # Per-tier breakdown
        for tier in ["consultant", "vendor", "entity"]:
            row = self.sender.db_conn.execute(
                """SELECT COUNT(DISTINCT contact_id) as contacts,
                          COUNT(*) as sends
                   FROM sends s JOIN contacts c ON s.contact_id = c.id
                   WHERE c.tier = ?""",
                (tier,),
            ).fetchone()
            if row:
                print(f"\n  {tier.title()} Tier:")
                print(f"    Contacts: {row['contacts']}, Sends: {row['sends']}")

        # Last 7 days
        print(f"\n  Last 7 Days:")
        for i in range(6, -1, -1):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            report = self.sender.get_daily_report(date)
            if report["total_sent"] > 0:
                print(f"    {date}: {report['total_sent']} sent, "
                      f"{report['bounces']} bounced, {report['opens']} opened")

        print(f"\n{'='*60}\n")

    # ─── Cleanup ─────────────────────────────────────────

    def close(self):
        """Clean up resources."""
        self.sender.close()


# ─── CLI Entry Point ─────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SkyRate Campaign Manager")
    parser.add_argument("--dry-run", action="store_true", help="Preview sends without sending")
    parser.add_argument("--report", action="store_true", help="Print campaign report")
    parser.add_argument("--summary", action="store_true", help="Print quick summary")
    args = parser.parse_args()

    manager = CampaignManager(dry_run=args.dry_run)
    manager.initialize()

    if args.report:
        manager.print_full_report()
    elif args.summary:
        manager.sender.print_summary()
    else:
        manager.run_daily()

    manager.close()


if __name__ == "__main__":
    main()
