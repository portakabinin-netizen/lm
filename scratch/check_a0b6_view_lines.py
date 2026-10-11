import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "FinanceDashboard.tsx" in line and "Total Lines:" in line:
            d = json.loads(line)
            content = d.get("content", "")
            for l in content.splitlines():
                if "Total Lines:" in l or "Showing lines" in l:
                    print(f"Step {d.get('step_index')}: {l}")
