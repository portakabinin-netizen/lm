import json
import urllib.request
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

tests = [
    ("leads project-active", "https://hibiz-nine.vercel.app/api/service/leads/project-active"),
    ("hr employees", "https://hibiz-nine.vercel.app/api/service/hr/employees?all=true"),
    ("attendance active-staff", "https://hibiz-nine.vercel.app/api/service/hr/attendance/active-staff"),
    ("attendance list", "https://hibiz-nine.vercel.app/api/service/hr/attendance/list"),
    ("attendance today", "https://hibiz-nine.vercel.app/api/service/hr/attendance/today"),
]

ctx = ssl.create_default_context()

for name, url in tests:
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'x-tenant-id': db_name,
        'User-Agent': 'Mozilla/5.0'
    })
    t0 = datetime.datetime.now()
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            elapsed = (datetime.datetime.now() - t0).total_seconds()
            data = resp.read().decode('utf-8')
            print(f"OK: {name} in {elapsed:.2f}s | Status {resp.status} | Len: {len(data)}")
    except urllib.error.HTTPError as e:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        print(f"HTTP {e.code}: {name} in {elapsed:.2f}s")
    except Exception as e:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        print(f"FAIL: {name} in {elapsed:.2f}s with {type(e).__name__}")
