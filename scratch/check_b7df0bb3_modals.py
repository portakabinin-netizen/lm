import json

b7df0bb3 = r"C:\Users\herry\.gemini\antigravity-ide\brain\b7df0bb3-74e3-4259-b188-e3eebba7a1c6\.system_generated\logs\transcript_full.jsonl"

steps_to_check = [1382, 1384, 1386, 1388, 1390, 1392, 1394, 1690]

with open(b7df0bb3, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            st = obj.get("step_index")
            if st in steps_to_check:
                c = obj.get("content", "")
                lines = c.splitlines()
                first = lines[5] if len(lines) > 5 else ""
                print(f"Step {st}: {first}")
                for l in lines[6:15]:
                    print("  ", l)
