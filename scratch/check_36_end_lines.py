import json, os, re

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
                    num = int(m.group(1))
                    views_36[num] = m.group(2)

for i in range(1070, 1101):
    if i in views_36:
        print(f"{i}: {views_36[i]}")
