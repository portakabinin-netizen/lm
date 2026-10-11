import json

c1868f3b = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

with open(c1868f3b, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            step = obj.get("step_index")
            if step in [432, 434, 436, 446]:
                print(f"=== Step {step} ===")
                c = obj.get("content", "")
                lines = c.splitlines()
                for l in lines[:10]:
                    print(l)
                print("...")
                for l in lines[-10:]:
                    print(l)
