import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# In 924d6424 step 4, lines 1 to 800 were viewed.
# Let's map how the line numbers correspond between 2428, 3401, 3682, 4024, 4401, 4403.
# Let's see what sections exist in 4024 lines:
# Lines 1 to 800 in 924d6424 step 4.
# What are lines 800 to 1010?
# In 924d6424:
# Step 246 viewed lines 1010 to 1026.
# Step 236 viewed lines 940 to 979.
# Step 234 viewed lines 980 to 1050.
# So in 924d6424, we have lines 1-800, 940-1050, 1050-1140, 1140-1200, 1220-1270, 1300-1350, 1350-1480, 1480-1530, 1520-1545, 1540-1600, 1600-1700, 1700-1950, 1950-2200, 2200-2400, 2340-2450, 2500-2700, 2635-2645, 2700-2900, 2695-2815!

# Notice that lines 1 to 2900 are almost 100% covered in 924d6424!
# Let's check exact missing lines between 1 and 2900 in 924d6424:
lines_924d = set()

log_924d = os.path.join(brain_dir, "924d6424-27a0-4913-9bdf-a2ce3aee4056", ".system_generated", "logs", "transcript_full.jsonl")
with open(log_924d, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            if "Total Lines: 4024" in c:
                for l in c.splitlines():
                    m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                    if m:
                        lines_924d.add(int(m.group(1)))

print(f"In 924d6424 (4024 lines): covered {len(lines_924d)} lines.")
missing = [i for i in range(1, 4025) if i not in lines_924d]
print(f"Missing lines count: {len(missing)}")

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

print("Missing line ranges in 924d6424:")
for r in ranges:
    print(f"  {r[0]} - {r[1]} ({r[1] - r[0] + 1} lines)")
