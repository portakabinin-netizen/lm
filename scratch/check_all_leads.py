import sqlite3, json, urllib.request

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')
base_url = 'https://hipk-gsz6.onrender.com/api'
headers = {'Authorization': f'Bearer {token}'}

# Let's test different leads routes
routes = [
    '/service/leads/project-active',
    '/service/leads/project-gallery',
    '/service/sales/leads',
    '/service/leads'
]

for r in routes:
    url = f'{base_url}{r}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            items = data.get('data', [])
            print(f"Route {r} -> {len(items)} items")
            for item in items[:3]:
                print(f"   {item.get('sender_name')}: status={item.get('status')}, loc={item.get('locationId')}")
    except Exception as e:
        print(f"Route {r} -> ERROR: {e}")
