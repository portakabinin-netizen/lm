import json, re

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl"
views = {}
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "FinanceDashboard.tsx" in line and "VIEW_FILE" in line:
            d = json.loads(line)
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    views[int(m.group(1))] = m.group(2)

for i in range(5690, 5740):
    if i in views:
        line_str = views[i].encode("ascii", "replace").decode("ascii")
        print(f"{i}: {line_str}")
