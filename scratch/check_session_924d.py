import json

session_path = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"

with open(session_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            stype = obj.get("type")
            step = obj.get("step_index")
            if stype == "PLANNER_RESPONSE":
                for tc in obj.get("tool_calls", []):
                    if "ProjectDashboard.tsx" in str(tc):
                        name = tc.get("name")
                        desc = tc.get("args", {}).get("Description") or tc.get("args", {}).get("Instruction")
                        sl = tc.get("args", {}).get("StartLine")
                        el = tc.get("args", {}).get("EndLine")
                        print(f"Step {step}: {name} (lines {sl}-{el}) | {desc}")
            elif stype == "VIEW_FILE":
                c = obj.get("content", "")
                lines = c.splitlines()
                first = " ".join([l.strip() for l in lines[:5]])
                print(f"Step {step}: VIEW_FILE {first}")
