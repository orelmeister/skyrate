import requests

url = 'https://opendata.usac.org/resource/srbr-2d59.json'
params = {'$limit': 1}
try:
    print("Making request...")
    r = requests.get(url, params=params, timeout=10)
    print(f'Status: {r.status_code}')
    if r.ok:
        data = r.json()
        print(f'Records: {len(data)}')
        if data:
            print(f'First record keys: {list(data[0].keys())[:5]}')
    else:
        print(f'Error: {r.text}')
except Exception as e:
    print(f'Exception: {e}')
