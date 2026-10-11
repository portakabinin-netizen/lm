import os, glob

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# Check all files inside brain_dir
print("Searching brain directory for FinanceDashboard and VoucherEntryModal...")
matches = []
for root, dirs, files in os.walk(brain_dir):
    for f in files:
        if "FinanceDashboard" in f or "VoucherEntry" in f or "voucher" in f.lower() or "finance" in f.lower():
            p = os.path.join(root, f)
            sz = os.path.getsize(p)
            matches.append((p, sz))

print(f"Total matching files found: {len(matches)}")
for m, sz in matches[:30]:
    print(f"{sz} bytes | {m}")
