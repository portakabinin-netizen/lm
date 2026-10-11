import json
import urllib.request
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
start_date = "2026-09-01T00:00:00.000Z"
end_date = "2026-09-30T23:59:59.999Z"

url = f"https://hibiz-nine.vercel.app/api/service/hr/attendance?from_date={start_date}&to_date={end_date}"

# Request WITHOUT x-tenant-id
req = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {token}',
    'User-Agent': 'Mozilla/5.0'
})

ctx = ssl.create_default_context()
t0 = datetime.datetime.now()
try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        data = resp.read().decode('utf-8')
        print(f"Status WITHOUT x-tenant-id: {resp.status} in {elapsed:.2f}s | Len: {len(data)}")
except Exception as e:
    elapsed = (datetime.datetime.now() - t0).total_seconds()
    print(f"FAILED WITHOUT x-tenant-id after {elapsed:.2f}s: {e}")
