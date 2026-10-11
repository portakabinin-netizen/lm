import json
import urllib.request
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

emp_url = "https://hibiz-nine.vercel.app/api/service/hr/employees?all=true"
req = urllib.request.Request(emp_url, headers={'Authorization': f'Bearer {token}', 'x-tenant-id': db_name})
ctx = ssl.create_default_context()
with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
    emps = json.loads(resp.read().decode('utf-8'))
    data = emps.get('data', [])
    print(f"Total employees count: {len(data)}")
    if data:
        print("Sample roles:", set(e.get('role') for e in data[:20]))
