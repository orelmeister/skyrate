"""Quick script to verify USAC dataset field names - final check."""
import json
from sodapy import Socrata

client = Socrata("opendata.usac.org", None)

# Check sample CRM numbers in jt8s-3q52
test_numbers = ["260026339", "260025521", "260026280", "260026184", "260013002", "261042134"]
print("=== Checking CRM numbers in jt8s-3q52 ===")
for num in test_numbers:
    results = client.get("jt8s-3q52", where=f"application_number='{num}'", limit=1)
    status = "FOUND" if results else "NOT FOUND"
    extra = ""
    if results:
        extra = f" | svc={results[0].get('service_type', '')[:30]} | desc={results[0].get('category_one_description', '')[:60]}"
    print(f"  {num}: {status}{extra}")

# Count how many FY2026 records total
print()
results = client.get("jt8s-3q52", where="funding_year='2026'", select="count(*) as cnt")
print(f"Total FY2026 records in jt8s-3q52: {results[0]['cnt'] if results else 'unknown'}")
