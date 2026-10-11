import json, os

# 1. Harvest all lines directly viewed in 9091031b, 9c978313, 7989469f, 36afcdb8
sessions = [
    "9091031b-b865-4df4-a8eb-694f9d8e6dea", # Sep 04 (1483 lines)
    "9c978313-6497-4767-b550-f862269faef2", # Sep 03 (1480-1483 lines)
    "7989469f-5ee3-4cd7-b2ee-28be1a1400be", # Aug 31 (1469 lines)
    "36afcdb8-d594-4610-b09e-afe11607ccbc", # Aug 23 (1471 lines)
]

lines_dict = {}

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and ("Total Lines: 148" in line or "Total Lines: 147" in line or "Total Lines: 146" in line):
                d = json.loads(line)
                content = d.get("content", "")
                for l in content.splitlines():
                    if ": " in l:
                        p = l.split(": ", 1)
                        if p[0].strip().isdigit():
                            l_num = int(p[0].strip())
                            if l_num not in lines_dict:
                                lines_dict[l_num] = p[1]

print(f"Direct lines captured: {len(lines_dict)} / 1483")
missing = [i for i in range(1, 1484) if i not in lines_dict]
print(f"Missing count: {len(missing)}")
ranges = []
cur_start = None
for i in range(1, 1484):
    if i in missing:
        if cur_start is None:
            cur_start = i
    else:
        if cur_start is not None:
            ranges.append((cur_start, i - 1))
            cur_start = None
if cur_start is not None:
    ranges.append((cur_start, 1483))
print("Missing ranges:", ranges)
