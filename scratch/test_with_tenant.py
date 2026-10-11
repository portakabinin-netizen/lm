import sqlite3, json, urllib.request, urllib.parse

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')

base_url = 'https://hipk-gsz6.onrender.com/api'

# Test with x-tenant-id: 41444c50503539303542 (Pratham Services)
headers = {
    'Authorization': f'Bearer {token}',
    'x-tenant-id': '41444c50503539303542'
}

from_date = '2026-08-31T18:30:00.000Z'
to_date = '2026-09-30T18:29:59.999Z'
url = f'{base_url}/service/hr/attendance?from_date={urllib.parse.quote(from_date)}&to_date={urllib.parse.quote(to_date)}'

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        logs = data.get('data', [])
        print("Success:", data.get('success'))
        print(f"Total attendance logs for Sep 2026 WITH x-tenant-id: {len(logs)}")
        if logs:
            sites = set(l.get('site_name') for l in logs)
            print(f"Sites in logs: {len(sites)} sites -> {list(sites)[:5]}")
except Exception as e:
    print("Failed:", e)
