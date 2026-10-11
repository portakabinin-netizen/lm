import json

tf_f6 = r"C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl"

# Find all views and replacements of FinancialComparisonLineChart in f64bcf3c
with open(tf_f6, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "FinancialComparisonLineChart" in line:
            d = json.loads(line)
            idx = d.get("step_index")
            tcs = d.get("tool_calls", [])
            for tc in tcs:
                name = tc.get("name")
                args = tc.get("args", {})
                print(f"Step {idx}: {name} | {args.get('Description', '')[:60]}")
