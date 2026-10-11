import subprocess

text = subprocess.check_output(["git", "show", "HEAD:modal/VoucherEntryModal.tsx"], encoding="utf-8")
lines = text.splitlines()
matches = [i for i, l in enumerate(lines) if "mode === 'payment'" in l]
print("Matches at lines:", [m+1 for m in matches])
for m in matches:
    print(f"Around line {m+1}:")
    for j in range(max(0, m-2), min(len(lines), m+8)):
        print(f"  {j+1}: {repr(lines[j])}")
