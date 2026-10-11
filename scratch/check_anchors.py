import json, os

import sys
sys.path.append('.')
from scratch.check_harvested import missing, ranges, lines_dict

# Load current baseline
with open("modal/VoucherEntryModal.tsx", "r", encoding="utf-8") as f:
    baseline = f.read().splitlines()

print(f"Current baseline has {len(baseline)} lines.")

# Let's check where the anchor points are
for r_start, r_end in ranges:
    before = lines_dict.get(r_start - 1, "")
    after = lines_dict.get(r_end + 1, "")
    print(f"\n--- Range {r_start} to {r_end} ({r_end - r_start + 1} lines) ---")
    print(f"  Line {r_start-1}: {repr(before)}")
    print(f"  Line {r_end+1}: {repr(after)}")
