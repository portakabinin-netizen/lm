import sqlite3, json, urllib.request

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')
base_url = 'https://hipk-gsz6.onrender.com/api'
headers = {'Authorization': f'Bearer {token}'}

url = f'{base_url}/service/hr/attendance'
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    logs = data.get('data', [])
    print(json.dumps(logs, indent=2))
