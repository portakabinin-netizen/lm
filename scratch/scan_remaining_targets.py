import os
import json
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
target_files = ['ledgermaster.tsx', 'profitandloss.tsx', 'assigncorporate.tsx', 'livetracker.tsx', 'apphelper.tsx']

sessions = []
for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(log_file):
            mtime = os.path.getmtime(log_file)
            dt = datetime.fromtimestamp(mtime)
            if datetime(2026, 9, 1) <= dt <= datetime(2026, 10, 3):
                sessions.append((dt, entry.name, log_file))

sessions.sort(key=lambda x: x[0], reverse=True)

for tf in target_files:
    print(f"\n==================== {tf} ====================")
    found_views = []
    for dt, sname, log_file in sessions:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if tf in line.lower() and ('"type":"VIEW_FILE"' in line or '"name":"view_file"' in line or '"name":"replace_file_content"' in line or '"name":"write_to_file"' in line):
                    try:
                        obj = json.loads(line)
                        step = obj.get("step_index")
                        stype = obj.get("type")
                        tcs = [tc.get("name") for tc in obj.get("tool_calls", []) if isinstance(tc, dict)]
                        found_views.append((sname, dt.strftime('%m-%d %H:%M'), step, stype, tcs))
                    except:
                        pass
    print(f"Total matching steps: {len(found_views)}")
    for sv in found_views[:15]:
        print(f"  {sv[0][:8]} ({sv[1]}) step {sv[2]}: {sv[3]} {sv[4]}")
