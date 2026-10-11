import json, re

tf_36 = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"
views_36 = {}
with open(tf_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "VoucherEntryModal.tsx" in line and "VIEW_FILE" in line:
            d = json.loads(line)
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    views_36[int(m.group(1))] = m.group(2)

print(f"Total lines collected: {len(views_36)}")
full_text = "\n".join(views_36[i] for i in range(1, 1101))
with open("c:/hipk/scratch/voucher_modal_from_36afcdb8.tsx", "w", encoding="utf-8") as f:
    f.write(full_text)

print("Saved c:/hipk/scratch/voucher_modal_from_36afcdb8.tsx successfully!")
print("First 5 lines:")
for i in range(1, 6):
    print(f"{i}: {views_36[i]}")
print("Last 5 lines:")
for i in range(1096, 1101):
    print(f"{i}: {views_36[i]}")
