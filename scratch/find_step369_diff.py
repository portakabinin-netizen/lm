import sys
sys.path.append('.')
from scratch.compare_step369 import tgt, current_text

c_lines = current_text.splitlines()
t_lines = tgt.splitlines()

match_start = 633
for i in range(len(t_lines)):
    tl = t_lines[i]
    cl = c_lines[match_start + i]
    if tl != cl:
        print(f"Diff at line {i} (global {match_start + i}):")
        print("  Target: ", repr(tl))
        print("  Current:", repr(cl))
        break
