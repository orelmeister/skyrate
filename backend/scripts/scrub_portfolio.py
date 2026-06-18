"""
Ari Portfolio Scrubbing Script (user_id=5, consultant_profile_id=2)

Deletes all consultant_schools rows for Ari whose BENs are NOT in the
approved list of 86 BENs. Run from skyrate.ai/backend/ with .env loaded.

Usage:
    cd skyrate.ai/backend
    python scripts/scrub_portfolio.py          # dry-run (default)
    python scripts/scrub_portfolio.py --apply  # actually delete
"""
import os
import sys

# Allow running from backend/ dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import pymysql
from sqlalchemy.engine import make_url

# ── Config ──────────────────────────────────────────────────────────
ARI_USER_ID = 5
ARI_CONSULTANT_PROFILE_ID = 2

APPROVED_BENS = {
    "17012285", "11270", "17029458", "16041280", "17012622", "210145",
    "17028375", "153128", "16062135", "16069179", "17048683", "9833",
    "16046699", "12746", "10422", "197225", "16067193", "221877",
    "16068065", "16062052", "16044231", "16027387", "16076060", "16050794",
    "17021255", "17029355", "16020115", "16067049", "10602", "12760",
    "105627", "14771", "16057902", "16056184", "17021269", "229007",
    "17036870", "17021445", "16057828", "197819", "1034", "17024509",
    "37171", "195230", "16061149", "152799", "17003573", "221667",
    "17024310", "210244", "231939", "17017737", "16056315", "15820",
    "17032409", "101136", "17007669", "17001481", "12743", "10733",
    "12946", "17007791", "12310", "11468", "11782", "17024852", "10623",
    "209474", "16065148", "194840", "197806", "16077544", "17028956",
    "102911", "16034151", "54120", "12320", "17017727", "160244",
    "16067400", "16045831", "233802", "16056537", "10175", "100724",
    "12879",
}

# ── Database connection ─────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("[FAIL] No DATABASE_URL in environment. Load .env first.")
    sys.exit(1)

parsed = make_url(DATABASE_URL)

conn = pymysql.connect(
    host=parsed.host,
    port=parsed.port or 3306,
    user=parsed.username,
    password=parsed.password,
    database=parsed.database,
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)

apply_mode = "--apply" in sys.argv

try:
    with conn.cursor() as cur:
        # 1. Verify Ari's profile
        cur.execute(
            "SELECT id, user_id, crn, company_name FROM consultant_profiles WHERE id = %s",
            (ARI_CONSULTANT_PROFILE_ID,),
        )
        profile = cur.fetchone()
        if not profile:
            print(f"[FAIL] consultant_profile_id={ARI_CONSULTANT_PROFILE_ID} not found")
            sys.exit(1)
        if profile["user_id"] != ARI_USER_ID:
            print(f"[FAIL] Profile {ARI_CONSULTANT_PROFILE_ID} belongs to user_id={profile['user_id']}, expected {ARI_USER_ID}")
            sys.exit(1)
        print(f"Profile: id={profile['id']}  user_id={profile['user_id']}  crn={profile['crn']}  company={profile['company_name']}")

        # 2. Fetch all current schools for Ari
        cur.execute(
            "SELECT id, ben, school_name, state, source_crn FROM consultant_schools "
            "WHERE consultant_profile_id = %s ORDER BY ben",
            (ARI_CONSULTANT_PROFILE_ID,),
        )
        all_schools = cur.fetchall()
        print(f"\nTotal schools in portfolio: {len(all_schools)}")
        print(f"Approved BENs count:        {len(APPROVED_BENS)}")

        # 3. Classify
        keep = []
        remove = []
        for s in all_schools:
            ben_str = str(s["ben"]).strip()
            if ben_str in APPROVED_BENS:
                keep.append(s)
            else:
                remove.append(s)

        print(f"Schools to KEEP:            {len(keep)}")
        print(f"Schools to REMOVE:          {len(remove)}")

        # 4. Show what will be removed
        if remove:
            print("\n--- Schools to be REMOVED ---")
            for s in remove:
                name = s['school_name'] or '(none)'
                state = s['state'] or '?'
                print(f"  id={s['id']:>5}  ben={s['ben']:<12}  name={name:<50}  state={state}")

        # 5. Show what will be kept (summary)
        print(f"\n--- Schools to be KEPT ({len(keep)}) ---")
        for s in keep:
            name = s['school_name'] or '(none)'
            state = s['state'] or '?'
            print(f"  id={s['id']:>5}  ben={s['ben']:<12}  name={name:<50}  state={state}")

        # 6. Execute deletion
        if not remove:
            print("\n[OK] Nothing to remove. Portfolio is already clean.")
        elif not apply_mode:
            print("\n[DRY RUN] No changes made. Run with --apply to delete the above schools.")
        else:
            remove_ids = [s["id"] for s in remove]
            placeholders = ",".join(["%s"] * len(remove_ids))
            cur.execute(
                f"DELETE FROM consultant_schools WHERE id IN ({placeholders}) "
                f"AND consultant_profile_id = %s",
                (*remove_ids, ARI_CONSULTANT_PROFILE_ID),
            )
            conn.commit()
            print(f"\n[APPLIED] Deleted {cur.rowcount} schools from Ari's portfolio.")

            # Verify final count
            cur.execute(
                "SELECT COUNT(*) as cnt FROM consultant_schools WHERE consultant_profile_id = %s",
                (ARI_CONSULTANT_PROFILE_ID,),
            )
            final = cur.fetchone()
            print(f"[VERIFY]  Remaining schools: {final['cnt']}")

finally:
    conn.close()
