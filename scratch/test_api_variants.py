import json
import urllib.request
import urllib.parse
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

tests = [
    ("No params", "https://hibiz-nine.vercel.app/api/service/hr/attendance"),
    ("Single date", "https://hibiz-nine.vercel.app/api/service/hr/attendance?date=2026-09-17"),
    ("Today preset", "https://hibiz-nine.vercel.app/api/service/hr/attendance?preset=today"),
    ("7days preset", "https://hibiz-nine.vercel.app/api/service/hr/attendance?from_date=7days"),
]

ctx = ssl.create_default_context()

for name, url in tests:
    print(f"\n--- Testing {name}: {url} ---")
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
            print(f"Status: {resp.status} in {elapsed}s | Len: {len(data)} | Snippet: {data[:200]}")
    except Exception as e:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        print(f"FAILED after {elapsed}s with {e}")
