import sqlite3, json, urllib.request, urllib.parse

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
if not row:
    print("No userSession found")
    exit()

session = json.loads(row[0])
token = session.get('token')
user = session.get('user', {})
print("User info:", user.get('name'), user.get('userRole'), user.get('corporateName'))
print("Token prefix:", token[:25] if token else None)

base_url = 'https://hipk-gsz6.onrender.com/api'

# 1. Fetch attendance
headers = {'Authorization': f'Bearer {token}'}
# Range for Sep 2026
from_date = '2026-08-31T18:30:00.000Z'
to_date = '2026-09-30T18:29:59.999Z'
url = f'{base_url}/service/hr/attendance?from_date={urllib.parse.quote(from_date)}&to_date={urllib.parse.quote(to_date)}'

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Attendance response success:", data.get('success'))
        logs = data.get('data', [])
        print("Total attendance logs for Sep 2026:", len(logs))
        if logs:
            print("First log:", json.dumps(logs[0], indent=2))
except Exception as e:
    print("Attendance request failed:", e)

# 2. Fetch leads
leads_url = f'{base_url}/service/leads'
req_leads = urllib.request.Request(leads_url, headers=headers)
try:
    with urllib.request.urlopen(req_leads) as response:
        data = json.loads(response.read().decode())
        leads = data.get('data', [])
        print("Total leads:", len(leads))
        for l in leads[:5]:
            shifts = l.get('siteShifts') or l.get('shifts') or []
            print(f"Lead: {l.get('sender_name')}, status: {l.get('status')}, shifts: {len(shifts)}")
except Exception as e:
    print("Leads request failed:", e)
