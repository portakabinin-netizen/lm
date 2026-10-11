import sys
sys.path.append('.')
from scratch.replay_all_voucher import current_text

for i, l in enumerate(current_text.splitlines()):
    if "Cash Transfer" in l:
        print(f"Line {i}: {l}")
        for j in range(max(0, i-3), min(len(current_text.splitlines()), i+5)):
            print(f"  {j}: {current_text.splitlines()[j]}")
