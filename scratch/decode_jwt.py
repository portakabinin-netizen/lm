import sqlite3, json, base64

conn = sqlite3.connect('scratch/RKStorage')
c = conn.cursor()
c.execute("SELECT value FROM catalystLocalStorage WHERE key='userSession'")
row = c.fetchone()
session = json.loads(row[0])
token = session.get('token')

parts = token.split('.')
payload_b64 = parts[1] + '=' * (-len(parts[1]) % 4)
payload = json.loads(base64.b64decode(payload_b64).decode())
print(json.dumps(payload, indent=2))
