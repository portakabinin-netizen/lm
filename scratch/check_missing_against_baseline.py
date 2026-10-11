import json, os, subprocess

# Let's inspect the missing ranges against the baseline
import sys
sys.path.append('.')
from scratch.check_harvested import ranges, lines_dict

with open("c:/hipk/modal/VoucherEntryModal.tsx", "r", encoding="utf-8") as f:
    baseline = f.read().splitlines()

print(f"Baseline lines: {len(baseline)}")

for r_start, r_end in ranges:
    before = lines_dict.get(r_start - 1, "")
    after = lines_dict.get(r_end + 1, "")
    
    # find 'before' in baseline
    b_idx = -1
    a_idx = -1
    for i, l in enumerate(baseline):
        if before.strip() and before.strip() == l.strip():
            b_idx = i
            break
    if b_idx != -1:
        for i in range(b_idx + 1, min(len(baseline), b_idx + 200)):
            if after.strip() and after.strip() == baseline[i].strip():
                a_idx = i
                break
    
    expected_count = r_end - r_start + 1
    found_count = (a_idx - b_idx - 1) if (b_idx != -1 and a_idx != -1) else -1
    print(f"Range {r_start}-{r_end} (expected {expected_count} lines): b_idx={b_idx}, a_idx={a_idx}, found={found_count}")
    if found_count > 0:
        print(f"  First: {repr(baseline[b_idx+1][:60])}")
        print(f"  Last:  {repr(baseline[a_idx-1][:60])}")
