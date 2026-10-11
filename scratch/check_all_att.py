import sqlite3, json, urllib.request, urllib.parse

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')
base_url = 'https://hipk-gsz6.onrender.com/api'
headers = {'Authorization': f'Bearer {token}'}

# Query all attendance
url = f'{base_url}/service/hr/attendance'
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        logs = data.get('data', [])
        print("Total attendance logs without filter:", len(logs))
        dates = [l.get('date') or l.get('dutyStart') for l in logs]
        print("Sample dates:", dates[:10])
except Exception as e:
    print("Attendance query failed:", e)

# Query leads endpoint (in ProjectDashboard it's probably different, let's see what ProjectDashboard calls)
