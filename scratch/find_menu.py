import sys
sys.path.append('.')
from scratch.replay_all_voucher import current_text

for i, l in enumerate(current_text.splitlines()):
    if "HORIZONTAL MENU" in l or "TIER 2" in l or "ScrollView horizontal" in l or "bill_collection" in l:
        print(f"Line {i}: {l}")
