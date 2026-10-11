import os
import json
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
target_files = [
    'appheader.tsx',
    'rolebasemenu.json',
    'ledgermaster.tsx',
    'profitandloss.tsx',
    'assigncorporate.tsx',
    'livetracker.tsx',
    'apphelper.tsx',
    '_layout.tsx'
]

sessions = []
for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(log_file):
            mtime = os.path.getmtime(log_file)
            dt = datetime.fromtimestamp(mtime)
            if datetime(2026, 9, 1) <= dt <= datetime(2026, 10, 3):
                sessions.append((dt, entry.name, log_file))

sessions.sort(key=lambda x: x[0])

for tf in target_files:
    print(f"\n==================== {tf} ====================")
    found = False
    for dt, sname, log_file in sessions:
        events = []
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if tf in line.lower():
                    try:
                        obj = json.loads(line)
                        stype = obj.get("type")
                        tcs = [tc.get("name") for tc in obj.get("tool_calls", []) if isinstance(tc, dict)]
                        if tcs or stype in ['CODE_ACTION', 'VIEW_FILE']:
                            events.append((obj.get("step_index"), stype, tcs))
                    except:
                        pass
        if events:
            found = True
            print(f"  Session {sname} ({dt.strftime('%m-%d %H:%M')}) - {len(events)} action events:")
            for step, stype, tcs in events:
                print(f"    Step {step}: type={stype} tools={tcs}")
    if not found:
        print("  None found in this period.")
