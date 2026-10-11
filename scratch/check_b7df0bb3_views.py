import json

b7df0bb3 = r"C:\Users\herry\.gemini\antigravity-ide\brain\b7df0bb3-74e3-4259-b188-e3eebba7a1c6\.system_generated\logs\transcript_full.jsonl"

with open(b7df0bb3, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            lines = c.splitlines()
            total = None
            for l in lines[:10]:
                if "Total Lines:" in l:
                    total = l
                    break
            for l in lines[:10]:
                if "Showing lines" in l:
                    print(f"Step {obj.get('step_index')}: {total} | {l}")
