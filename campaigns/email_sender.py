"""
SkyRate AI — Email Sender (Gmail API)

Handles:
- Gmail API OAuth2 authentication
- Email composition with merge fields & CAN-SPAM footer
- Rate limiting with randomized delays
- Warmup schedule enforcement
- Bounce detection & unsubscribe handling
- SQLite state tracking
"""

import base64
import hashlib
import os
import random
import sqlite3
import time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from campaigns.config import (
    CAMPAIGN_DB_PATH,
    COMPANY_NAME,
    COMPANY_URL,
    GMAIL_CREDENTIALS_FILE,
    GMAIL_SCOPES,
    GMAIL_TOKEN_FILE,
    MAX_BOUNCE_RATE,
    MAX_CONSECUTIVE_BOUNCES,
    MAX_DELAY_BETWEEN_EMAILS_SEC,
    MAX_SPAM_COMPLAINT_RATE,
    MIN_DELAY_BETWEEN_EMAILS_SEC,
    PHYSICAL_ADDRESS,
    SENDER_EMAIL,
    SENDER_NAME,
    UNSUBSCRIBE_BASE_URL,
    WARMUP_SCHEDULE,
)


class EmailSender:
    """Gmail API email sender with warmup, rate limiting, and tracking."""

    def __init__(self):
        self.service = None
        self.db_conn = None
        self._consecutive_bounces = 0
        self._campaign_start_date: Optional[datetime] = None

    # ─── Initialization ──────────────────────────────────

    def initialize(self):
        """Set up Gmail API and database."""
        self._auth_gmail()
        self._init_db()
        self._load_campaign_state()
        print(f"[EmailSender] Initialized. Sender: {SENDER_EMAIL}")

    def _auth_gmail(self):
        """Authenticate with Gmail API via OAuth2."""
        creds = None

        if os.path.exists(GMAIL_TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_FILE, GMAIL_SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(GMAIL_CREDENTIALS_FILE):
                    raise FileNotFoundError(
                        f"Gmail credentials file not found: {GMAIL_CREDENTIALS_FILE}\n"
                        "Download from Google Cloud Console → APIs → Credentials → OAuth 2.0"
                    )
                flow = InstalledAppFlow.from_client_secrets_file(GMAIL_CREDENTIALS_FILE, GMAIL_SCOPES)
                creds = flow.run_local_server(port=0)

            with open(GMAIL_TOKEN_FILE, "w") as token:
                token.write(creds.to_json())

        self.service = build("gmail", "v1", credentials=creds)
        print("[EmailSender] Gmail API authenticated")

    def _init_db(self):
        """Create SQLite database and tables for campaign tracking."""
        os.makedirs(os.path.dirname(CAMPAIGN_DB_PATH), exist_ok=True)
        self.db_conn = sqlite3.connect(CAMPAIGN_DB_PATH)
        self.db_conn.row_factory = sqlite3.Row

        self.db_conn.executescript("""
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                first_name TEXT,
                last_name TEXT,
                organization TEXT,
                tier TEXT NOT NULL,          -- consultant, vendor, entity
                priority_score INTEGER DEFAULT 0,
                state TEXT,
                extra_data TEXT,            -- JSON blob for tier-specific fields
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                sequence_step INTEGER NOT NULL,
                template_name TEXT NOT NULL,
                subject TEXT NOT NULL,
                message_id TEXT,            -- Gmail message ID
                thread_id TEXT,             -- Gmail thread ID (for reply threading)
                sent_at TEXT DEFAULT (datetime('now')),
                status TEXT DEFAULT 'sent', -- sent, bounced, opened, clicked
                FOREIGN KEY (contact_id) REFERENCES contacts(id)
            );

            CREATE TABLE IF NOT EXISTS bounces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                send_id INTEGER,
                bounce_type TEXT,           -- hard, soft
                reason TEXT,
                detected_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (contact_id) REFERENCES contacts(id)
            );

            CREATE TABLE IF NOT EXISTS unsubscribes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                contact_id INTEGER,
                reason TEXT,
                unsubscribed_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS campaign_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT PRIMARY KEY,
                total_sent INTEGER DEFAULT 0,
                bounces INTEGER DEFAULT 0,
                opens INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                unsubscribes INTEGER DEFAULT 0,
                spam_complaints INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
            CREATE INDEX IF NOT EXISTS idx_contacts_tier ON contacts(tier);
            CREATE INDEX IF NOT EXISTS idx_sends_contact ON sends(contact_id);
            CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);
        """)
        self.db_conn.commit()
        print("[EmailSender] Database initialized")

    def _load_campaign_state(self):
        """Load or initialize campaign start date."""
        row = self.db_conn.execute(
            "SELECT value FROM campaign_state WHERE key = 'start_date'"
        ).fetchone()

        if row:
            self._campaign_start_date = datetime.fromisoformat(row["value"])
        else:
            self._campaign_start_date = datetime.now()
            self.db_conn.execute(
                "INSERT INTO campaign_state (key, value) VALUES (?, ?)",
                ("start_date", self._campaign_start_date.isoformat()),
            )
            self.db_conn.commit()

    # ─── Warmup & Rate Limiting ──────────────────────────

    def get_campaign_day(self) -> int:
        """Get the current campaign day number (1-indexed)."""
        delta = datetime.now() - self._campaign_start_date
        return max(1, delta.days + 1)

    def get_daily_limit(self) -> int:
        """Get max emails allowed today based on warmup schedule."""
        day = self.get_campaign_day()
        for start, end, limit in WARMUP_SCHEDULE:
            if start <= day <= end:
                return limit
        return WARMUP_SCHEDULE[-1][2]  # Fallback to last tier

    def get_sends_today(self) -> int:
        """Count emails sent today."""
        today = datetime.now().strftime("%Y-%m-%d")
        row = self.db_conn.execute(
            "SELECT COUNT(*) as cnt FROM sends WHERE DATE(sent_at) = ?", (today,)
        ).fetchone()
        return row["cnt"] if row else 0

    def can_send(self) -> tuple[bool, str]:
        """Check if sending is allowed right now. Returns (allowed, reason)."""
        # Check daily limit
        sends_today = self.get_sends_today()
        daily_limit = self.get_daily_limit()
        if sends_today >= daily_limit:
            return False, f"Daily limit reached ({sends_today}/{daily_limit})"

        # Check consecutive bounces
        if self._consecutive_bounces >= MAX_CONSECUTIVE_BOUNCES:
            return False, f"Too many consecutive bounces ({self._consecutive_bounces})"

        # Check bounce rate (last 100 sends)
        stats = self._get_recent_stats(100)
        if stats["total"] >= 20:  # Need minimum sample
            bounce_rate = stats["bounces"] / stats["total"]
            if bounce_rate > MAX_BOUNCE_RATE:
                return False, f"Bounce rate too high: {bounce_rate:.1%} (max {MAX_BOUNCE_RATE:.1%})"

            spam_rate = stats["spam_complaints"] / stats["total"]
            if spam_rate > MAX_SPAM_COMPLAINT_RATE:
                return False, f"SPAM RATE CRITICAL: {spam_rate:.2%} — CAMPAIGN HALTED"

        return True, "OK"

    def _get_recent_stats(self, n: int = 100) -> dict:
        """Get stats for the last N sends."""
        row = self.db_conn.execute(f"""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounces,
                SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opens,
                0 as spam_complaints
            FROM (SELECT * FROM sends ORDER BY sent_at DESC LIMIT ?)
        """, (n,)).fetchone()
        return dict(row) if row else {"total": 0, "bounces": 0, "opens": 0, "spam_complaints": 0}

    # ─── Email Composition ───────────────────────────────

    def _build_unsubscribe_url(self, email: str) -> str:
        """Generate unique unsubscribe URL with hash."""
        token = hashlib.sha256(f"{email}:{SENDER_EMAIL}:skyrate_unsub".encode()).hexdigest()[:16]
        return f"{UNSUBSCRIBE_BASE_URL}?email={email}&token={token}"

    def _build_can_spam_footer(self, email: str) -> str:
        """Build CAN-SPAM compliant footer."""
        unsub_url = self._build_unsubscribe_url(email)
        return (
            f"\n\n---\n"
            f"{COMPANY_NAME} | {PHYSICAL_ADDRESS}\n"
            f"Unsubscribe: {unsub_url}\n"
            f"You received this because you're listed in USAC's public E-Rate database."
        )

    def compose_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        is_reply: bool = False,
        thread_id: Optional[str] = None,
    ) -> dict:
        """
        Compose a Gmail API message object.

        Args:
            to_email: Recipient email address
            subject: Email subject line
            body: Plain text body (from template)
            is_reply: If True, use same thread (References/In-Reply-To headers)
            thread_id: Gmail thread ID to reply to
        """
        # Add CAN-SPAM footer
        full_body = body + self._build_can_spam_footer(to_email)
        unsub_url = self._build_unsubscribe_url(to_email)

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = subject

        # Anti-spam headers
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        msg["Precedence"] = "bulk"

        # Plain text part
        msg.attach(MIMEText(full_body, "plain"))

        # Encode for Gmail API
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        message = {"raw": raw}

        # Thread replies together
        if is_reply and thread_id:
            message["threadId"] = thread_id

        return message

    # ─── Sending ─────────────────────────────────────────

    def send_email(
        self,
        contact_id: int,
        to_email: str,
        subject: str,
        body: str,
        template_name: str,
        sequence_step: int,
        is_reply: bool = False,
        thread_id: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Send a single email via Gmail API with full tracking.

        Returns the Gmail API response dict or None if sending was blocked.
        """
        # Pre-flight checks
        allowed, reason = self.can_send()
        if not allowed:
            print(f"  [BLOCKED] {reason}")
            return None

        # Check unsubscribe list
        if self.is_unsubscribed(to_email):
            print(f"  [SKIP] {to_email} is unsubscribed")
            return None

        # Compose
        message = self.compose_email(to_email, subject, body, is_reply, thread_id)

        try:
            # Send via Gmail API
            result = self.service.users().messages().send(
                userId="me", body=message
            ).execute()

            gmail_message_id = result.get("id", "")
            gmail_thread_id = result.get("threadId", "")

            # Record the send
            self.db_conn.execute(
                """INSERT INTO sends (contact_id, sequence_step, template_name,
                   subject, message_id, thread_id, status)
                   VALUES (?, ?, ?, ?, ?, ?, 'sent')""",
                (contact_id, sequence_step, template_name, subject,
                 gmail_message_id, gmail_thread_id),
            )
            self._update_daily_stat("total_sent")
            self.db_conn.commit()
            self._consecutive_bounces = 0

            print(f"  [SENT] → {to_email} | Step {sequence_step} | {template_name}")
            return result

        except Exception as e:
            error_str = str(e)
            print(f"  [ERROR] Failed to send to {to_email}: {error_str}")

            # Check if it's a bounce-type error
            if "550" in error_str or "invalid" in error_str.lower() or "not found" in error_str.lower():
                self._record_bounce(contact_id, None, "hard", error_str)

            return None

    def send_with_delay(self, *args, **kwargs) -> Optional[dict]:
        """Send email then sleep a random interval before returning."""
        result = self.send_email(*args, **kwargs)

        if result:
            delay = random.uniform(MIN_DELAY_BETWEEN_EMAILS_SEC, MAX_DELAY_BETWEEN_EMAILS_SEC)
            print(f"  [WAIT] {delay:.0f}s before next send...")
            time.sleep(delay)

        return result

    # ─── Bounce & Unsubscribe Tracking ───────────────────

    def _record_bounce(self, contact_id: int, send_id: Optional[int], bounce_type: str, reason: str):
        """Record a bounce and update counters."""
        self.db_conn.execute(
            "INSERT INTO bounces (contact_id, send_id, bounce_type, reason) VALUES (?, ?, ?, ?)",
            (contact_id, send_id, bounce_type, reason),
        )
        self._update_daily_stat("bounces")
        self._consecutive_bounces += 1
        self.db_conn.commit()

        if bounce_type == "hard":
            # Mark contact to skip in future
            self.db_conn.execute(
                "UPDATE contacts SET priority_score = -999 WHERE id = ?", (contact_id,)
            )
            self.db_conn.commit()
            print(f"  [BOUNCE] Hard bounce — contact {contact_id} disabled")

    def add_unsubscribe(self, email: str, reason: str = "user_request"):
        """Add email to unsubscribe list."""
        self.db_conn.execute(
            """INSERT OR IGNORE INTO unsubscribes (email, reason)
               VALUES (?, ?)""",
            (email, reason),
        )
        self.db_conn.commit()
        print(f"  [UNSUB] {email} unsubscribed ({reason})")

    def is_unsubscribed(self, email: str) -> bool:
        """Check if email is on unsubscribe list."""
        row = self.db_conn.execute(
            "SELECT 1 FROM unsubscribes WHERE email = ?", (email,)
        ).fetchone()
        return row is not None

    # ─── Contact Management ──────────────────────────────

    def add_contact(
        self,
        email: str,
        first_name: str,
        last_name: str,
        organization: str,
        tier: str,
        state: str = "",
        priority_score: int = 0,
        extra_data: str = "{}",
    ) -> Optional[int]:
        """Add a contact to the database. Returns contact ID or None if duplicate."""
        try:
            cursor = self.db_conn.execute(
                """INSERT INTO contacts (email, first_name, last_name, organization,
                   tier, priority_score, state, extra_data)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (email, first_name, last_name, organization, tier, priority_score, state, extra_data),
            )
            self.db_conn.commit()
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None  # Duplicate email

    def get_contacts_for_tier(self, tier: str, limit: int = 100) -> list[dict]:
        """Get contacts for a tier, ordered by priority."""
        rows = self.db_conn.execute(
            """SELECT * FROM contacts
               WHERE tier = ? AND priority_score > -999
               AND email NOT IN (SELECT email FROM unsubscribes)
               ORDER BY priority_score DESC
               LIMIT ?""",
            (tier, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_last_send(self, contact_id: int) -> Optional[dict]:
        """Get the most recent send for a contact."""
        row = self.db_conn.execute(
            "SELECT * FROM sends WHERE contact_id = ? ORDER BY sent_at DESC LIMIT 1",
            (contact_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_send_count(self, contact_id: int) -> int:
        """Count total sends to a contact."""
        row = self.db_conn.execute(
            "SELECT COUNT(*) as cnt FROM sends WHERE contact_id = ?", (contact_id,)
        ).fetchone()
        return row["cnt"] if row else 0

    # ─── Stats & Reporting ───────────────────────────────

    def _update_daily_stat(self, field: str, increment: int = 1):
        """Increment a daily stat counter."""
        today = datetime.now().strftime("%Y-%m-%d")
        self.db_conn.execute(
            f"""INSERT INTO daily_stats (date, {field})
                VALUES (?, ?)
                ON CONFLICT(date)
                DO UPDATE SET {field} = {field} + ?""",
            (today, increment, increment),
        )

    def get_daily_report(self, date: Optional[str] = None) -> dict:
        """Get stats for a specific date (defaults to today)."""
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")

        row = self.db_conn.execute(
            "SELECT * FROM daily_stats WHERE date = ?", (date,)
        ).fetchone()

        if row:
            return dict(row)
        return {"date": date, "total_sent": 0, "bounces": 0, "opens": 0,
                "clicks": 0, "unsubscribes": 0, "spam_complaints": 0}

    def get_campaign_summary(self) -> dict:
        """Get overall campaign stats."""
        row = self.db_conn.execute("""
            SELECT
                COUNT(DISTINCT contact_id) as total_contacts_reached,
                COUNT(*) as total_sends,
                SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as total_bounces,
                SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as total_opens
            FROM sends
        """).fetchone()

        unsub_count = self.db_conn.execute("SELECT COUNT(*) as cnt FROM unsubscribes").fetchone()

        summary = dict(row) if row else {}
        summary["total_unsubscribes"] = unsub_count["cnt"] if unsub_count else 0
        summary["campaign_day"] = self.get_campaign_day()
        summary["daily_limit"] = self.get_daily_limit()
        summary["sends_today"] = self.get_sends_today()
        summary["remaining_today"] = max(0, summary["daily_limit"] - summary["sends_today"])

        return summary

    def print_summary(self):
        """Print a formatted campaign summary."""
        s = self.get_campaign_summary()
        print("\n" + "=" * 50)
        print(f"  SkyRate Campaign — Day {s['campaign_day']}")
        print("=" * 50)
        print(f"  Daily limit:    {s['daily_limit']} emails")
        print(f"  Sent today:     {s['sends_today']}")
        print(f"  Remaining:      {s['remaining_today']}")
        print(f"  Total sends:    {s.get('total_sends', 0)}")
        print(f"  Total bounces:  {s.get('total_bounces', 0)}")
        print(f"  Total opens:    {s.get('total_opens', 0)}")
        print(f"  Unsubscribes:   {s['total_unsubscribes']}")
        print("=" * 50 + "\n")

    # ─── Cleanup ─────────────────────────────────────────

    def close(self):
        """Close database connection."""
        if self.db_conn:
            self.db_conn.close()
            print("[EmailSender] Database connection closed")
