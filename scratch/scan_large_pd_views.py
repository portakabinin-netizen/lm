import os
import json
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
views = []

for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript_full.jsonl")
        if os.path.exists(log_file):
            mtime = os.path.getmtime(log_file)
            dt = datetime.fromtimestamp(mtime)
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                        try:
                            obj = json.loads(line)
                            c = obj.get("content", "")
                            cl = [l for l in c.splitlines() if l.strip()]
                            total_lines = 0
                            for l in cl[:10]:
                                if "Total Lines:" in l:
                                    total_lines = int(l.split("Total Lines:")[1].strip().split()[0])
                                    break
                            line_nums = []
                            for l in cl:
                                p = l.split(':')[0].strip()
                                if p.isdigit():
                                    line_nums.append(int(p))
                            if line_nums:
                                views.append((dt, entry.name, obj.get('step_index'), total_lines, min(line_nums), max(line_nums)))
                        except:
                            pass

views.sort(key=lambda x: (x[0], x[2]))
print(f"Total views found: {len(views)}")
# Filter for views where total_lines >= 4000
large_views = [v for v in views if v[3] >= 4000]
print(f"Views with total_lines >= 4000: {len(large_views)}")
for v in large_views:
    print(f"{v[0].strftime('%Y-%m-%d %H:%M')} | {v[1][:8]} step {v[2]:<4} | total={v[3]} | lines {v[4]} - {v[5]}")
