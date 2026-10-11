import json
import urllib.request
import urllib.parse
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

start_date = "2026-09-01T00:00:00.000Z"
end_date = "2026-09-30T23:59:59.999Z"

params = urllib.parse.urlencode({'from_date': start_date, 'to_date': end_date})
url = f"https://hibiz-nine.vercel.app/api/service/hr/attendance?{params}"

print(f"Testing URL: {url}")
print(f"Headers: x-tenant-id={db_name}")

req = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {token}',
    'x-tenant-id': db_name,
    'User-Agent': 'Mozilla/5.0'
})

t0 = datetime.datetime.now()
try:
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        data = resp.read().decode('utf-8')
        print(f"Status: {resp.status} in {elapsed}s")
        print(f"Response len: {len(data)}, first 400 chars: {data[:400]}")
except urllib.error.HTTPError as e:
    elapsed = (datetime.datetime.now() - t0).total_seconds()
    err_data = e.read().decode('utf-8', errors='ignore')
    print(f"HTTPError: {e.code} in {elapsed}s: {err_data[:500]}")
except Exception as e:
    elapsed = (datetime.datetime.now() - t0).total_seconds()
    print(f"FAILED after {elapsed}s with exception: {type(e).__name__}: {e}")
