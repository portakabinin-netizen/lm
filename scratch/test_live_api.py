import sqlite3, json, urllib.request

conn = sqlite3.connect('scratch/live_rk.db')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
session = json.loads(c.fetchone()[0])
token = session.get('token')
base_url = 'https://hipk-gsz6.onrender.com/api'

# Test with token alone (no x-tenant-id)
url = f'{base_url}/service/hr/attendance?from_date=2026-08-31T18:30:00.000Z&to_date=2026-09-30T18:29:59.999Z'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        logs = data.get('data', [])
        print('Logs with token alone (IST range):', len(logs))
except Exception as e:
    print('Failed IST:', e)

# Test with x-tenant-id header
req_tenant = urllib.request.Request(url, headers={
    'Authorization': f'Bearer {token}',
    'x-tenant-id': session.get('dbName')
})
try:
    with urllib.request.urlopen(req_tenant) as resp:
        data = json.loads(resp.read().decode())
        logs = data.get('data', [])
        print('Logs WITH x-tenant-id:', len(logs))
except Exception as e:
    print('Failed tenant:', e)
