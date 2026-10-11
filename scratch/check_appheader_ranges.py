import json

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\51de807f-d55d-4095-bf41-e5d0ad1fece9\.system_generated\logs\transcript_full.jsonl"
steps = [405, 406, 407, 408, 409, 410, 411, 412, 1137, 1138]

with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in steps:
            print(f"Step {obj.get('step_index')} ({obj.get('type')}):")
            if obj.get("type") == "PLANNER_RESPONSE":
                print("  Tool calls:", obj.get("tool_calls"))
            elif obj.get("type") == "VIEW_FILE":
                c = obj.get("content", "")
                clines = c.splitlines()
                print(f"  First line: {clines[0] if clines else ''}")
                print(f"  Second line: {clines[1] if len(clines)>1 else ''}")
                print(f"  Last line: {clines[-1] if clines else ''}")
                print(f"  Second-to-last: {clines[-2] if len(clines)>1 else ''}")
