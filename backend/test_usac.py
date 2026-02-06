import requests

url = 'https://opendata.usac.org/resource/qdmp-ygft.json'
params = {"$where": "state = 'CA' AND form_471_frn_status_name = 'Funded'", "$limit": 5}
r = requests.get(url, params=params, timeout=30)
print(f"Status: {r.status_code}")
if r.status_code != 200:
    print(f"Error: {r.text[:500]}")
else:
    data = r.json()
    print(f"Count: {len(data)}")
    for x in data[:5]:
        print(f"  {x.get('form_471_frn_status_name')} | {x.get('organization_name', '')[:35]} | ${x.get('funding_commitment_request', 0)}")
