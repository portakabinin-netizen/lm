import json, re

# Assemble base from a5cf669f step 15 and 89d39ee6 step 639
p_a5 = r"C:\Users\herry\.gemini\antigravity-ide\brain\a5cf669f-863d-4d0f-9e38-d981d91feaab\.system_generated\logs\transcript_full.jsonl"
p_89 = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"

lines_base = {}

# 1. Lines 1 to 800 from a5cf669f step 15
with open(p_a5, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 15:
            for l in d.get("content", "").splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_base[int(m.group(1))] = m.group(2)

print(f"From a5cf669f: {len(lines_base)} lines (min {min(lines_base.keys())}, max {max(lines_base.keys())})")

# 2. Lines 801 to 1204 from 89d39ee6 step 639 and 872
with open(p_89, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") in (639, 872):
            for l in d.get("content", "").splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_base[int(m.group(1))] = m.group(2)

print(f"Total base lines: {len(lines_base)} (min {min(lines_base.keys())}, max {max(lines_base.keys())})")
missing = [i for i in range(1, max(lines_base.keys()) + 1) if i not in lines_base]
print("Missing lines count:", len(missing))
if missing:
    print("Missing lines:", missing[:30])
