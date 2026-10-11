import json, os

sessions = [
    "9c978313-6497-4767-b550-f862269faef2",
    "9091031b-b865-4df4-a8eb-694f9d8e6dea",
    "7989469f-5ee3-4cd7-b2ee-28be1a1400be",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "a0b61b51-0899-4ad8-9363-cddafcf79685",
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
    "83d63010-919d-406b-8aa3-31dcaa2f3901",
    "a5cf669f-863d-4d0f-9e38-d981d91feaab",
    "89d39ee6-698d-4d6a-8eae-5141dc08fca6",
]

def find_lines_between(anchor_before, anchor_after):
    for sess_id in sessions:
        path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "VoucherEntryModal.tsx" in line and (anchor_before in line or anchor_after in line):
                    d = json.loads(line)
                    content = d.get("content", "")
                    lines = [l.split(": ", 1)[1] if ": " in l and l.split(": ", 1)[0].strip().isdigit() else l for l in content.splitlines()]
                    # check if both anchors are in lines
                    idx_before = -1
                    idx_after = -1
                    for i, l in enumerate(lines):
                        if anchor_before.strip() and anchor_before.strip() in l:
                            idx_before = i
                        elif anchor_after.strip() and anchor_after.strip() in l and idx_before != -1:
                            idx_after = i
                            break
                    if idx_before != -1 and idx_after != -1 and idx_after > idx_before:
                        extracted = lines[idx_before+1:idx_after]
                        return sess_id[:8], d.get("step_index"), extracted
    return None, None, None

import sys
sys.path.append('.')
from scratch.check_anchors import ranges, lines_dict

for r_start, r_end in ranges:
    before = lines_dict.get(r_start - 1, "")
    after = lines_dict.get(r_end + 1, "")
    sess, step, ext = find_lines_between(before, after)
    if ext:
        print(f"Range {r_start}-{r_end}: Found {len(ext)} lines in {sess} step {step} (expected {r_end - r_start + 1})")
    else:
        print(f"Range {r_start}-{r_end}: NOT found directly with exact anchors")
