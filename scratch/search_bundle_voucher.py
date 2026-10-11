import re

with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

pos = bundle.find("Accounting Voucher Creation")
if pos != -1:
    print("Found 'Accounting Voucher Creation' at pos:", pos)
    # Extract surrounding context (e.g. 3000 chars before and after)
    start = max(0, pos - 1500)
    end = min(len(bundle), pos + 4000)
    snippet = bundle[start:end]
    with open("scratch/bundle_voucher_snippet.txt", "w", encoding="utf-8") as out:
        out.write(snippet)
    print("Saved snippet around 'Accounting Voucher Creation' to scratch/bundle_voucher_snippet.txt")
else:
    print("'Accounting Voucher Creation' NOT found in bundle")
