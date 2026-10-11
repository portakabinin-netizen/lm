import os
import json
import glob
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
target_files = [
    'appheader.tsx',
    'backgroundtasks.ts',
    'livetracker.tsx',
    'apphelper.tsx',
    'rolebasemenu.json',
    'ledgermaster.tsx',
    'profitandloss.tsx',
    'assigncorporate.tsx',
    '_layout.tsx'
]

sessions = []
for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(log_file):
            mtime = os.path.getmtime(log_file)
            dt = datetime.fromtimestamp(mtime)
            # Filter from Sep 1 to Oct 2
            if datetime(2026, 9, 1) <= dt <= datetime(2026, 10, 3):
                sessions.append((dt, entry.name, log_file))

sessions.sort(key=lambda x: x[0])
print(f"Found {len(sessions)} relevant sessions between Sep 1 and Oct 2.")

results = {}
for dt, sname, log_file in sessions:
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line_lower = line.lower()
                for tf in target_files:
                    if tf in line_lower:
                        try:
                            obj = json.loads(line)
                            step = obj.get("step_index")
                            stype = obj.get("type")
                            tool_calls = obj.get("tool_calls", [])
                            tc_names = [tc.get("name") for tc in tool_calls if isinstance(tc, dict)]
                            key = f"{sname} ({dt.strftime('%m-%d %H:%M')})"
                            if tf not in results:
                                results[tf] = []
                            results[tf].append((key, step, stype, tc_names))
                        except:
                            pass
    except Exception as e:
        print(f"Error reading {log_file}: {e}")

for tf, entries in results.items():
    print(f"\n==================== {tf} ({len(entries)} occurrences) ====================")
    # Group by session
    sess_summary = {}
    for sess, step, stype, tcs in entries:
        if sess not in sess_summary:
            sess_summary[sess] = []
        sess_summary[sess].append((step, stype, tcs))
    for sess, steps in sess_summary.items():
        print(f"  Session {sess}: {len(steps)} events")
        # print write/view events
        for step, stype, tcs in steps:
            if tcs or stype in ['CODE_ACTION', 'VIEW_FILE']:
                print(f"    Step {step}: type={stype} tools={tcs}")
