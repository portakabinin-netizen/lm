import json
import urllib.request
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

url = "https://hibiz-nine.vercel.app/api/service/hr/attendance/active-staff"
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'x-tenant-id': db_name})
ctx = ssl.create_default_context()
with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    items = data.get('data', [])
    print(f"active-staff count: {len(items)}")
    if items:
        print("First item keys:", items[0].keys())
        print("First item sample:", {k: items[0][k] for k in ['employeeId', 'site_name', 'status', 'shiftCode'] if k in items[0]})
