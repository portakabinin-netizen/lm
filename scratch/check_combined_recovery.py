import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# In c1868f3b (Total lines: 4024):
# Step 599 showed lines 1180 to 1220! -> covers 1201-1219!
# Step 597 showed lines 1220 to 1270!
# Step 540 showed lines 1280 to 1340!
# Step 469 showed lines 2480 to 2540! -> covers 2480-2499!
# Step 520 showed lines 2440 to 2490! -> covers 2451-2490!

sessions = [
    "c1868f3b-9dde-4eb0-b055-98666af278ca",
    "924d6424-27a0-4913-9bdf-a2ce3aee4056"
]

all_4024_lines = {}

for sid in sessions:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if "Total Lines: 4024" in c or "Total Lines: 4017" in c:
                    for l in c.splitlines():
                        m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                        if m:
                            num = int(m.group(1))
                            if num not in all_4024_lines:
                                all_4024_lines[num] = m.group(2)

print(f"Total 4024-version lines recovered so far: {len(all_4024_lines)}")
missing = [i for i in range(1, 4025) if i not in all_4024_lines]
print(f"Missing count: {len(missing)}")

# Group missing into ranges
ranges = []
if missing:
    start = missing[0]
    prev = missing[0]
    for x in missing[1:]:
        if x == prev + 1:
            prev = x
        else:
            ranges.append((start, prev))
            start = x
            prev = x
    ranges.append((start, prev))

print("Remaining missing line ranges in 4024:")
for r in ranges:
    print(f"  {r[0]} - {r[1]} ({r[1] - r[0] + 1} lines)")
