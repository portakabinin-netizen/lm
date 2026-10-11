with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

import re
matches = [m.start() for m in re.finditer(re.escape("Payment Voucher Entry"), bundle)]
print("Matches for 'Payment Voucher Entry':", matches)
for pos in matches:
    print(f"--- Pos {pos} ---")
    start = max(0, pos - 500)
    end = min(len(bundle), pos + 1500)
    print(bundle[start:end])
