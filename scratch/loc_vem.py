with open("scratch/apk_extracted/index.android.bundle", "r", encoding="utf-8", errors="ignore") as f:
    bundle = f.read()

pos = bundle.find("VoucherEntryModal")
print("Pos:", pos)
start = max(0, pos - 200)
end = min(len(bundle), pos + 200)
print(bundle[start:end])
