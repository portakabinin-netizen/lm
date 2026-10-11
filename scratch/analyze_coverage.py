import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# Let's inspect coverage for lines 1 to 4403
# For each session that had total_lines around 3600-4403:
sessions = {}

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
                        if total:
                            line_nums = []
                            for l in lines:
                                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                                if m:
                                    line_nums.append(int(m.group(1)))
                            if line_nums:
                                k = (entry.name, total)
                                if k not in sessions:
                                    sessions[k] = []
                                sessions[k].append((min(line_nums), max(line_nums), obj.get("step_index")))
        except:
            pass

for (sname, total), ranges in sorted(sessions.items(), key=lambda x: (x[0][1], x[0][0])):
    if total >= 2500:
        covered = set()
        for r in ranges:
            for i in range(r[0], r[1] + 1):
                covered.add(i)
        print(f"Session {sname[:8]} total_lines={total}: views={len(ranges)}, covered {len(covered)}/{total} lines ({len(covered)*100//total}%)")
