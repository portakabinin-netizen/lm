import json
import urllib.request
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

start_date = "2026-09-01T00:00:00.000Z"
end_date = "2026-09-30T23:59:59.999Z"

url = f"https://hibiz-nine.vercel.app/api/service/hr/attendance-dashboard?from_date={start_date}&to_date={end_date}"

req = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {token}',
    'x-tenant-id': db_name,
    'User-Agent': 'Mozilla/5.0'
})

ctx = ssl.create_default_context()
t0 = datetime.datetime.now()
try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        data = resp.read().decode('utf-8')
        print(f"Status attendance-dashboard: {resp.status} in {elapsed:.2f}s | Len: {len(data)}")
        parsed = json.loads(data)
        print("Keys:", parsed.keys())
        att = parsed.get('attendance', [])
        print("Attendance count:", len(att))
except Exception as e:
    elapsed = (datetime.datetime.now() - t0).total_seconds()
    print(f"FAILED attendance-dashboard after {elapsed:.2f}s: {e}")
