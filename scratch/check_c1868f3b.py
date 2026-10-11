import json

session_path = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

with open(session_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        stype = obj.get("type")
        step = obj.get("step_index")
        if stype == "USER_INPUT":
            print(f"Step {step} USER_INPUT: {repr(obj.get('content')[:120])}")
        elif stype == "PLANNER_RESPONSE":
            for tc in obj.get("tool_calls", []):
                name = tc.get("name")
                if name in ["replace_file_content", "write_to_file", "multi_replace_file_content"]:
                    if "ProjectDashboard" in str(tc):
                        desc = tc.get("args", {}).get("Description") or tc.get("args", {}).get("Instruction")
                        print(f"Step {step} {name}: {desc}")
