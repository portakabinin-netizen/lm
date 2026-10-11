import sqlite3, json, urllib.request

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')
base_url = 'https://hipk-gsz6.onrender.com/api'
headers = {'Authorization': f'Bearer {token}'}

url = f'{base_url}/service/leads/project-active'
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Success:", data.get('success'))
        leads = data.get('data', [])
        print("Total leads from project-active:", len(leads))
        for l in leads:
            print(f"- Lead: {l.get('sender_name')}, status: {l.get('status')}, shifts: {len(l.get('siteShifts', []))}")
except Exception as e:
    print("Failed:", e)
