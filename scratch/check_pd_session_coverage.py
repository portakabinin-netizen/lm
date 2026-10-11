import os
import json
import re
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# We want lines of ProjectDashboard.tsx from sessions up to Sep 30 2026
# Specifically:
# 1. 153e79b4-00e0-41c6-ba97-4b8b7083ff82 (Sep 30)
# 2. 924d6424-27a0-4913-9bdf-a2ce3aee4056 (Sep 25)
# 3. 51de807f-d55d-4095-bf41-e5d0ad1fece9 (Sep 24)
# 4. c1868f3b-9dde-4eb0-b055-98666af278ca (Sep 17)
# 5. b7df0bb3-74e3-4259-b188-e3eebba7a1c6 (Sep 17)
# 6. other sessions

sessions_to_check = [
    ("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 4403),
    ("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4401),
    ("924d6424-27a0-4913-9bdf-a2ce3aee4056", 4024),
    ("51de807f-d55d-4095-bf41-e5d0ad1fece9", 4024),
    ("c1868f3b-9dde-4eb0-b055-98666af278ca", 4024),
]

viewed_lines = {} # line_number -> line_text for 4403 version

for sid, expected_total in sessions_to_check:
    log_file = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(log_file):
        continue
    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                lines = c.splitlines()
                total = 0
                for l in lines[:10]:
                    if "Total Lines:" in l:
                        total = int(l.split("Total Lines:")[1].strip().split()[0])
                        break
                print(f"Session {sid[:8]} step {obj.get('step_index')}: total_lines={total}")
                step_lines = {}
                for l in lines:
                    m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                    if m:
                        step_lines[int(m.group(1))] = m.group(2)
                if step_lines:
                    print(f"   min={min(step_lines.keys())} max={max(step_lines.keys())} count={len(step_lines)}")
