import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# Find any VIEW_FILE that has lines between 780 and 960 in any session with total_lines >= 3000
for entry in os.scandir(brain_dir):
    if entry.is_dir():
        log_file = os.path.join(entry.path, ".system_generated", "logs", "transcript_full.jsonl")
        if not os.path.exists(log_file):
            continue
        try:
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                        obj = json.loads(line)
                        c = obj.get("content", "")
                        lines = c.splitlines()
                        total = None
                        for l in lines[:10]:
                            if "Total Lines:" in l:
                                total = int(l.split("Total Lines:")[1].strip().split()[0])
                                break
                        if total and total >= 2500:
                            for l in lines:
                                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                                if m:
                                    ln = int(m.group(1))
                                    if 800 <= ln <= 940:
                                        print(f"Found line {ln} in {entry.name[:8]} (total={total}) step {obj.get('step_index')}")
                                        break
        except:
            pass
