import json
import urllib.request
import datetime
import ssl

with open('scratch/session.json') as f:
    session = json.load(f)

token = session['token']
db_name = session['dbName']

# First fetch 1 employee ID
emp_url = "https://hibiz-nine.vercel.app/api/service/hr/employees?limit=1"
req = urllib.request.Request(emp_url, headers={'Authorization': f'Bearer {token}', 'x-tenant-id': db_name})
ctx = ssl.create_default_context()
with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
    emps = json.loads(resp.read().decode('utf-8'))
    first_emp = emps.get('data', [])[0]
    emp_id = first_emp['_id']
    print(f"Testing with employeeId: {emp_id} ({first_emp.get('name')})")

att_url = f"https://hibiz-nine.vercel.app/api/service/hr/attendance?employeeId={emp_id}&from_date=2026-09-01T00:00:00.000Z&to_date=2026-09-30T23:59:59.999Z"
req2 = urllib.request.Request(att_url, headers={'Authorization': f'Bearer {token}', 'x-tenant-id': db_name})
t0 = datetime.datetime.now()
try:
    with urllib.request.urlopen(req2, timeout=15, context=ctx) as resp2:
        elapsed = (datetime.datetime.now() - t0).total_seconds()
        data = resp2.read().decode('utf-8')
        print(f"SUCCESS with employeeId in {elapsed:.2f}s | Status {resp2.status} | Len: {len(data)}")
        parsed = json.loads(data)
        print(f"Records count: {len(parsed.get('data', []))}")
except Exception as e:
    elapsed = (datetime.datetime.now() - t0).total_seconds()
    print(f"FAILED with employeeId in {elapsed:.2f}s: {e}")
