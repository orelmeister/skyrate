import requests, json
r = requests.post('https://skyrate.ai/api/v1/auth/login', json={'email':'test_vendor@example.com','password':'TestPass123!'}, timeout=30)
token = r.json()['access_token']
h = {'Authorization': f'Bearer {token}'}
r = requests.get('https://skyrate.ai/api/v1/vendor/predicted-leads?page=1&page_size=3', headers=h, timeout=30)
data = r.json()
print(json.dumps(data, indent=2)[:3000])
