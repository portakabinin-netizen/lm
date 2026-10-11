import json, re

p_f6 = r"C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl"
views = {}

with open(p_f6, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "FinanceDashboard.tsx" in line and "VIEW_FILE" in line:
            d = json.loads(line)
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    views[int(m.group(1))] = m.group(2)

print(f"Total views in f64bcf3c: {len(views)}")

# Lines 650 to 1475 contains FinancialComparisonLineChart
chart_lines = [views[i] for i in range(650, 1475) if i in views]
chart_code = "\n".join(chart_lines)

with open("c:/hipk/scratch/FinancialComparisonLineChart_extracted.tsx", "w", encoding="utf-8") as f:
    f.write(chart_code)

print(f"Extracted chart code: {len(chart_lines)} lines.")
print("First 10 lines:")
for l in chart_lines[:10]:
    print(" ", l)
print("Last 10 lines:")
for l in chart_lines[-10:]:
    print(" ", l)
