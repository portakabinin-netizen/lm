with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

for term in ["VoucherEntryModal", "VoucherEntry", "Accounting Voucher", "Total Dr:", "Cur Bal:"]:
    print(f"'{term}': {bundle.count(term)}")
