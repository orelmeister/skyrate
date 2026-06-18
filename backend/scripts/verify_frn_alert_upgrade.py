"""
Verification script for FRN Alert Pipeline Upgrade (Tasks 1-5).
Tests that all modified modules compile correctly and validates
core logic using source inspection (no DB connection required).

Run from skyrate.ai/backend/:
    python scripts/verify_frn_alert_upgrade.py
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS = 0
FAIL = 0

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def check(desc, condition):
    global PASS, FAIL
    if condition:
        print(f"  [PASS] {desc}")
        PASS += 1
    else:
        print(f"  [FAIL] {desc}")
        FAIL += 1


def test_syntax_check():
    """Compile-check all modified files for syntax errors"""
    print("\n--- Syntax Check ---")

    files_to_check = [
        os.path.join(BACKEND_DIR, "app", "services", "scheduler_service.py"),
        os.path.join(BACKEND_DIR, "app", "services", "frn_upsert.py"),
        os.path.join(BACKEND_DIR, "scripts", "purge_super_user_alerts.py"),
    ]

    for fpath in files_to_check:
        fname = os.path.basename(fpath)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                source = f.read()
            compile(source, fpath, "exec")
            check(f"{fname} compiles without syntax errors", True)
        except SyntaxError as e:
            check(f"{fname} compiles (SyntaxError: line {e.lineno}: {e.msg})", False)


def test_dedup_function_exists():
    """Test Task 2: Deduplication function exists in frn_upsert.py"""
    print("\n--- Task 2: FRN Deduplication ---")
    fpath = os.path.join(BACKEND_DIR, "app", "services", "frn_upsert.py")
    with open(fpath, "r", encoding="utf-8") as f:
        source = f.read()

    check("_deduplicate_frn_records function defined",
          "def _deduplicate_frn_records(frn_records: list)" in source)
    check("Status priority map present",
          '"funded": 10' in source or "'funded': 10" in source)
    check("Dedup called in upsert_frn_snapshots",
          "frn_records = _deduplicate_frn_records(frn_records)" in source)

    # Test the dedup logic in isolation by exec-ing just that function
    # Extract the function source and test it
    exec_ns = {}
    # Get just the dedup function
    start = source.find("def _deduplicate_frn_records")
    end = source.find("\ndef upsert_frn_snapshots")
    dedup_source = source[start:end]
    exec(dedup_source, exec_ns)
    dedup_fn = exec_ns["_deduplicate_frn_records"]

    # Test basic dedup
    records = [
        {"ben": "100", "frn": "FRN001", "status": "Pending"},
        {"ben": "100", "frn": "FRN001", "status": "Committed"},
        {"ben": "100", "frn": "FRN002", "status": "Funded"},
    ]
    result = dedup_fn(records)
    check("Dedup collapses 3 records to 2 unique (ben, frn)", len(result) == 2)

    frn001 = [r for r in result if r["frn"] == "FRN001"]
    check("Dedup picks Committed over Pending for FRN001",
          len(frn001) == 1 and frn001[0]["status"] == "Committed")

    check("Empty input returns empty list", dedup_fn([]) == [])

    records_no_frn = [{"ben": "100", "frn": "", "status": "Funded"}]
    check("Records with empty frn are skipped", dedup_fn(records_no_frn) == [])

    records2 = [
        {"ben": "200", "frn": "FRN010", "status": "Pending"},
        {"ben": "200", "frn": "FRN010", "status": "Denied"},
    ]
    result2 = dedup_fn(records2)
    check("Denied beats Pending",
          len(result2) == 1 and result2[0]["status"] == "Denied")


def test_sliding_year_logic():
    """Test Task 1: Verify the sliding year logic in scheduler_service.py"""
    print("\n--- Task 1: Sliding Funding Year ---")
    fpath = os.path.join(BACKEND_DIR, "app", "services", "scheduler_service.py")
    with open(fpath, "r", encoding="utf-8") as f:
        source = f.read()

    check("'current_year = now.year' present in refresh_admin_frn_snapshot",
          "current_year = now.year" in source)
    check("'funding_years = [current_year, current_year - 1]' present",
          "funding_years = [current_year, current_year - 1]" in source)
    check("'client.get_frn_status_batch(all_bens, year=fy)' present",
          "client.get_frn_status_batch(all_bens, year=fy)" in source)
    check("'client.get_frn_status_by_spin(vp.spin, year=fy)' present",
          "client.get_frn_status_by_spin(vp.spin, year=fy)" in source)
    check("Old 'all years' comment removed",
          "# Batch fetch from USAC for all BENs (all years)" not in source)


def test_consolidated_deadlines():
    """Test Task 3: Consolidated deadline logic"""
    print("\n--- Task 3: Consolidated Deadline Alerts ---")
    fpath = os.path.join(BACKEND_DIR, "app", "services", "scheduler_service.py")
    with open(fpath, "r", encoding="utf-8") as f:
        source = f.read()

    check("Consolidation threshold 'len(pending_alerts) > 5' present",
          "len(pending_alerts) > 5" in source)
    check("'Multiple Deadlines Approaching' title present",
          "Multiple Deadlines Approaching" in source)
    check("'consolidated' metadata key present",
          '"consolidated": True' in source)
    check("pending_alerts list initialized",
          "pending_alerts = []" in source)
    check("Sorting by days_remaining for consolidated alert",
          'pending_alerts.sort(key=lambda x: x["days_remaining"])' in source)


def test_scheduler_deactivation():
    """Test Task 4: Single daily sync architecture"""
    print("\n--- Task 4: Single Daily Sync Architecture ---")
    fpath = os.path.join(BACKEND_DIR, "app", "services", "scheduler_service.py")
    with open(fpath, "r", encoding="utf-8") as f:
        source = f.read()

    check("sync_frn_statuses job is DEACTIVATED",
          "DEACTIVATED" in source and "sync_frn_statuses" in source)
    check("sync_consultant_frn_statuses job is DEACTIVATED",
          "sync_consultant_frn_statuses" in source and
          "# scheduler.add_job(" in source)

    # Check the new cron triggers
    check("Admin snapshot: CronTrigger(hour=17, minute=0)",
          "CronTrigger(hour=17, minute=0, timezone='UTC')" in source)
    check("Deadline check: CronTrigger(hour=17, minute=30)",
          "CronTrigger(hour=17, minute=30, timezone='UTC')" in source)

    # Verify old IntervalTrigger(hours=6) for deadlines is gone
    check("Old IntervalTrigger(hours=6) for deadlines removed",
          "IntervalTrigger(hours=6),\n        id='check_deadlines'" not in source)


def test_purge_script():
    """Test Task 5: Super User Alert Clean-Up script"""
    print("\n--- Task 5: Super User Alert Purge ---")
    fpath = os.path.join(BACKEND_DIR, "scripts", "purge_super_user_alerts.py")
    check("purge_super_user_alerts.py exists", os.path.isfile(fpath))

    with open(fpath, "r", encoding="utf-8") as f:
        source = f.read()

    check("Targets user_id=5", "Alert.user_id == 5" in source)
    check("Uses .delete() for cleanup", ".delete(" in source)
    check("Has commit after delete", "db.commit()" in source)


def test_no_emojis_in_code():
    """Verify no emoji characters in print statements"""
    print("\n--- Code Quality: No Emojis ---")
    import re

    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U00002600-\U000026FF"
        "\U00002700-\U000027BF\U0000FE00-\U0000FE0F\U00010000-\U0010FFFF]"
    )

    files_to_check = [
        os.path.join(BACKEND_DIR, "app", "services", "scheduler_service.py"),
        os.path.join(BACKEND_DIR, "app", "services", "frn_upsert.py"),
        os.path.join(BACKEND_DIR, "scripts", "purge_super_user_alerts.py"),
    ]

    all_clean = True
    for fpath in files_to_check:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        if emoji_pattern.search(content):
            all_clean = False
            check(f"No emojis in {os.path.basename(fpath)}", False)

    if all_clean:
        check("No emoji characters found in any modified file", True)


if __name__ == "__main__":
    print("=" * 60)
    print("FRN Alert Pipeline Upgrade - Verification")
    print("=" * 60)

    test_syntax_check()
    test_dedup_function_exists()
    test_sliding_year_logic()
    test_consolidated_deadlines()
    test_scheduler_deactivation()
    test_purge_script()
    test_no_emojis_in_code()

    print("\n" + "=" * 60)
    print(f"RESULTS: {PASS} passed, {FAIL} failed")
    print("=" * 60)

    if FAIL > 0:
        sys.exit(1)
    else:
        print("[OK] All checks passed!")
        sys.exit(0)

