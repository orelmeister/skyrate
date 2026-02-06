import requests
import json

results = []

# Test FRN Status Dataset
r = requests.get('https://opendata.usac.org/resource/qdmp-ygft.json', params={
    '$where': "physical_state = 'CA' AND funding_year = '2025'",
    '$limit': 100,
})
data = r.json()

statuses = {}
for row in data:
    s = row.get('frn_status', 'Unknown')
    statuses[s] = statuses.get(s, 0) + 1

results.append(f"FRN Status Dataset: {len(data)} records")
results.append(f"Statuses: {json.dumps(statuses)}")
if data:
    results.append(f"Fields: {list(data[0].keys())}")
    results.append(f"Sample: ben={data[0].get('ben')}, status={data[0].get('frn_status')}, amt=${data[0].get('commitment_amount')}")

# Write results
with open('api_results.txt', 'w') as f:
    f.write('\n'.join(results))

print("Results written to api_results.txt")
