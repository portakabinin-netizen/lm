import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# Let's inspect all view files of 4024 and 4401 in 924d6424, c1868f3b, and 153e79b4
# First, let's collect all lines with their line numbers from 924d6424 (where total was 4024)
lines_4024 = {}

def harvest_lines(session_id, target_total):
    res = {}
    tf = os.path.join(brain_dir, session_id, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): return res
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if f"Total Lines: {target_total}" in c:
                    for l in c.splitlines():
                        m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                        if m:
                            res[int(m.group(1))] = m.group(2)
    return res

h_924d_4024 = harvest_lines("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4024)
h_c1868_4024 = harvest_lines("c1868f3b-9dde-4eb0-b055-98666af278ca", 4024)
h_924d_4401 = harvest_lines("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4401)
h_153e_4403 = harvest_lines("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 4403)

print(f"h_924d_4024 count: {len(h_924d_4024)}")
print(f"h_c1868_4024 count: {len(h_c1868_4024)}")
print(f"h_924d_4401 count: {len(h_924d_4401)}")
print(f"h_153e_4403 count: {len(h_153e_4403)}")
