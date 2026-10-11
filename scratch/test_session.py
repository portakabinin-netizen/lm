import subprocess
import json

proc = subprocess.Popen(['adb', 'shell'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
cmd = "run-as com.hibiz.app sqlite3 /data/data/com.hibiz.app/databases/RKStorage \"SELECT value FROM catalystLocalStorage WHERE key='userSession';\"\n"
out, err = proc.communicate(cmd)

print("RAW LEN:", len(out))
try:
    data = json.loads(out.strip())
    print("TOKEN:", data.get('token', '')[:25] + '...')
    print("DBNAME:", data.get('dbName'))
    print("ROLE:", data.get('userRole') or data.get('role'))
    with open('scratch/session.json', 'w') as f:
        json.dump(data, f, indent=2)
    print("Saved to scratch/session.json")
except Exception as e:
    print("JSON parse error:", e)
    print("OUT snippet:", out[:300])
