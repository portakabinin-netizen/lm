import re

with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

keywords = ["Voucher", "voucher", "Payment Voucher", "Lead / Proj", "Cur Bal", "Particulars", "Suresh Chauhan", "Cancel Vch", "Quit", "Accept"]
for kw in keywords:
    count = bundle.count(kw)
    print(f"'{kw}': {count}")
