"""
Ari Portfolio Backfill Script (user_id=5, consultant_profile_id=2)

Backfills the 31 missing approved schools from admin_frn_snapshots
to consultant_schools for Ari's profile.

Usage:
    cd skyrate.ai/backend
    python scripts/backfill_ari_schools.py          # dry-run (default)
    python scripts/backfill_ari_schools.py --apply  # actually insert
"""
import os
import sys
from datetime import datetime

# Allow running from backend/ dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import pymysql
from sqlalchemy.engine import make_url

ARI_USER_ID = 5
ARI_CONSULTANT_PROFILE_ID = 2

MISSING_BENS = {
    "1034", "12760", "153128", "16041280", "16046699", "16056184", "16056315",
    "16057828", "16057902", "16061149", "16062135", "16065148", "16067193",
    "16069179", "17007669", "17012285", "17012622", "17017727", "17021269",
    "17028956", "17029355", "17029458", "17032409", "17036870", "17048683",
    "194840", "197819", "210145", "231939", "233802", "9833"
}

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("[FAIL] No DATABASE_URL in environment.")
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
        # Fetch Ari's profile details
        cur.execute(
            "SELECT id, user_id, crn, company_name FROM consultant_profiles WHERE id = %s",
            (ARI_CONSULTANT_PROFILE_ID,),
        )
        profile = cur.fetchone()
        if not profile:
            print(f"[FAIL] consultant_profile_id={ARI_CONSULTANT_PROFILE_ID} not found")
            sys.exit(1)
        print(f"Profile: id={profile['id']}  user_id={profile['user_id']}  crn={profile['crn']}  company={profile['company_name']}")

        # 1. Fetch current schools for Ari to make sure we don't insert duplicates
        cur.execute(
            "SELECT ben FROM consultant_schools WHERE consultant_profile_id = %s",
            (ARI_CONSULTANT_PROFILE_ID,)
        )
        existing_bens = {str(row["ben"]).strip() for row in cur.fetchall()}
        print(f"[INFO] Current portfolio schools count: {len(existing_bens)}")

        to_add = MISSING_BENS - existing_bens
        print(f"[INFO] Unique approved BENs to backfill: {len(to_add)}")

        if not to_add:
            print("[INFO] No schools to backfill. Your portfolio already matches!")
            sys.exit(0)

        # 2. Get school details from admin_frn_snapshots
        format_strings = ",".join(["%s"] * len(to_add))
        cur.execute(
            f"SELECT ben, organization_name, source FROM admin_frn_snapshots "
            f"WHERE ben IN ({format_strings}) ORDER BY ben",
            list(to_add)
        )
        snapshot_records = cur.fetchall()

        # Deduplicate snapshot results by BEN
        details = {}
        for row in snapshot_records:
            ben = str(row["ben"]).strip()
            # Prefer non-null, non-empty names
            if ben not in details or (row["organization_name"] and not details[ben]["school_name"]):
                details[ben] = {
                    "school_name": row["organization_name"],
                    "state": "NY", # default as state is not in snapshots
                    "source": row["source"] or "consultant"
                }

        # Handle any BENs not found in snapshots with a default name from the official E-Rate definitions
        default_names = {
            "17012285": "Ahi Ezer Yeshiva School",
            "11270": "Adolph Schreiber Hebrew Acad",
            "17029458": "Bais Chana Heritage School, Inc.",
            "16041280": "Bais Chaya Inc",
            "17012622": "Yeshiva Bais Chaya Esther",
            "210145": "Bais Reuvan Kaminetz Of Lakewood",
            "17028375": "Bais Yaakov Of Waterbury",
            "153128": "Cong. Bais Malka",
            "16062135": "Bais Trany Of Monsey",
            "16069179": "Battalion Christian Academy",
            "17048683": "Broadway Housing Communities School District",
            "9833": "Beth Jacob Parochial School",
            "16046699": "Bnos Bais Yaakov High School",
            "12746": "Brandeis School,",
            "10422": "Bronx-Manhattan Sda School",
            "197225": "Chabad Hebrew Academy",
            "16067193": "Chabad Lubavitch Of Southside",
            "221877": "Chabad Of Southern Nevada",
            "16068065": "Cheder Chabad Inc.",
            "16062052": "Cheder Toras Zev",
            "16044231": "Congregation Ohr Menachem",
            "16027387": "Congregation Yeshiva Beis Chaya Mushka Inc.",
            "16076060": "Cypress Hills Child Care Corp",
            "16050794": "Congregation Elite",
            "17021255": "Evergreen Charter School",
            "17029355": "Foxman Torah Institute",
            "16020115": "Bais Faiga School For Girls",
            "16067049": "Great Oaks Elementary",
            "10602": "Greek American Institute Of New York Inc",
            "12760": "Hebrew Academy Of Long Beach",
            "105627": "Hebrew Academy Hb Ca",
            "14771": "House Of Good Shepherd School",
            "16057902": "Islamic School Of Rhode Island",
            "16056184": "Jets Yeshivah",
            "17021269": "Jewels Inclusive Preschool",
            "229007": "Katz Yeshiva High School Of South Florida",
            "17036870": "Kindle Education Public Charter School, Inc.",
            "17021445": "Kinneret Day School",
            "16057828": "Lakewood Cheder School",
            "197819": "Lakewood Cheder School",
            "1034": "Lawrence Family Dev Chtr Sch",
            "17024509": "Lumen High School",
            "37171": "Maimonides Academy Brauser",
            "195230": "Maimonides Hebrew Day School",
            "16061149": "Maimonides Hebrew Day School",
            "152799": "Yeshiva Ohr Tora",
            "17003573": "Melvin J Berman Hebrew Academy",
            "221667": "Mestiva Ateres Yaakov",
            "17024310": "Mesivta Kesser Torah Of Baltimore",
            "210244": "Miraj Islamic School",
            "231939": "New Horizon Community School",
            "17017737": "North Tampa Christian Academy",
            "16056315": "Northside Charter High School",
            "15820": "Bais Chaya Monsey",
            "17032409": "Ohr Chadash Academy",
            "101136": "Ohr Eliyahu Academy",
            "17007669": "Philips Academy",
            "17001481": "Rabbi Jacob Joseph School",
            "12743": "Rambam High School",
            "10733": "S A R Academy",
            "12946": "Tiegerman School",
            "17007791": "Shulamith School",
            "12310": "Solomon Schechter",
            "11468": "St Demetrios",
            "11782": "St Mark's Day School",
            "17024852": "St Peters Child Care Center, Inc.",
            "10623": "St Raymond Academy",
            "209474": "Step Special Torah",
            "16065148": "Tiferes Bais Yaakov School",
            "194840": "Toras Emes Academy",
            "197806": "Tashbar Sephardic Yeshiva",
            "16077544": "Tree Of Knowledge",
            "17028956": "Tree Of Knowledge",
            "102911": "Valley Torah",
            "16034151": "Williamsburg Charter",
            "54120": "Yeshivath Beth Yehudah School",
            "12320": "Yeshiva Of Central Queens",
            "17017727": "Yeshiva Gedolah Of Waterbury",
            "160244": "Yeshiva Har Torah",
            "16067400": "Yeshiva Ktana Of Waterbury",
            "16045831": "Yeshiva Of Greater Washington",
            "233802": "Ohr Yitzchock",
            "16056537": "Yeshiva Rlkti Primary",
            "10175": "Yeshiva Rabbi S R Hirsch",
            "100724": "Yeshiva Rav Isacsohn Academy",
            "12879": "Yeshiva Of Far Rockaway"
        }

        records_to_insert = []
        now = datetime.utcnow()

        for ben in sorted(list(to_add)):
            if ben in details:
                school_name = details[ben]["school_name"]
                state = details[ben]["state"]
            else:
                school_name = default_names.get(ben, f"E-Rate School BEN {ben}")
                state = "NY" # reasonable default

            records_to_insert.append({
                "consultant_profile_id": ARI_CONSULTANT_PROFILE_ID,
                "ben": ben,
                "school_name": school_name,
                "state": state,
                "added_at": now,
                "last_synced": now,
                "source_crn": profile["crn"]
            })

        print(f"\n--- Schools to Backfill ({len(records_to_insert)}) ---")
        for rec in records_to_insert:
            print(f"  ben={rec['ben']:<12}  name={rec['school_name']:<60}  state={rec['state']}")

        if apply_mode:
            print("\n[INFO] Inserting rows into consultant_schools...")
            insert_query = (
                "INSERT INTO consultant_schools (consultant_profile_id, ben, school_name, state, added_at, last_synced, source_crn) "
                "VALUES (%(consultant_profile_id)s, %(ben)s, %(school_name)s, %(state)s, %(added_at)s, %(last_synced)s, %(source_crn)s)"
            )
            cur.executemany(insert_query, records_to_insert)
            conn.commit()
            print(f"[OK] Successfully backfilled {len(records_to_insert)} schools!")
        else:
            print("\n[DRY RUN] Run with --apply to execute the database inserts.")

except Exception as e:
    print(f"[ERROR] Transaction failed: {e}")
    conn.rollback()
    sys.exit(1)
finally:
    conn.close()
