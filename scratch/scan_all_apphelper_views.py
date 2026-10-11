import os
import json
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = []
for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript_full.jsonl")
        if os.path.exists(log_file):
            mtime = os.path.getmtime(log_file)
            dt = datetime.fromtimestamp(mtime)
            if datetime(2026, 9, 1) <= dt <= datetime(2026, 10, 3):
                sessions.append((dt, entry.name, log_file))

sessions.sort(key=lambda x: x[0], reverse=True)

for dt, sname, log_file in sessions:
    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "appHelper.tsx" in line and '"type":"VIEW_FILE"' in line:
                try:
                    obj = json.loads(line)
                    c = obj.get("content", "")
                    cl = [l for l in c.splitlines() if l.strip()]
                    line_nums = []
                    for l in cl:
                        p = l.split(':')[0].strip()
                        if p.isdigit():
                            line_nums.append(int(p))
                    if line_nums:
                        print(f"Session {sname[:8]} ({dt.strftime('%m-%d %H:%M')}) step {obj.get('step_index')}: lines {min(line_nums)} to {max(line_nums)}")
                except:
                    pass
