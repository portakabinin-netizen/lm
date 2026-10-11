import sys
sys.path.append('.')
from scratch.check_harvested import ranges, lines_dict

for r_start, r_end in ranges:
    before_lines = [f"{i}: {lines_dict.get(i, '')}" for i in range(max(1, r_start - 5), r_start)]
    after_lines = [f"{i}: {lines_dict.get(i, '')}" for i in range(r_end + 1, min(1484, r_end + 6))]
    print(f"\n=================== GAP {r_start} to {r_end} ({r_end - r_start + 1} lines) ===================")
    print("BEFORE GAP:")
    for l in before_lines: print(" ", l)
    print("AFTER GAP:")
    for l in after_lines: print(" ", l)
