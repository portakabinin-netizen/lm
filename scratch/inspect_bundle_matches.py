with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

for target in ["Payment Voucher", "Lead / Proj", "Suresh Chauhan"]:
    pos = 0
    print(f"=== Matches for '{target}' ===")
    while True:
        pos = bundle.find(target, pos)
        if pos == -1:
            break
        print(f"Position: {pos}")
        start = max(0, pos - 400)
        end = min(len(bundle), pos + 400)
        print(bundle[start:end])
        print("-" * 50)
        pos += len(target)
