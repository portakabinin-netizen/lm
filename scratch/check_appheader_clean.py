import json

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\542ebb05-48bf-4dc7-bd6b-a9e15a45f6eb\.system_generated\logs\transcript_full.jsonl"

with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "AppHeader.tsx" in line:
            obj = json.loads(line)
            step = obj.get("step_index")
            stype = obj.get("type")
            if stype == "VIEW_FILE":
                c = obj.get("content", "")
                cl = [l for l in c.splitlines() if l.strip()]
                first_code = ""
                last_code = ""
                for l in cl:
                    parts = l.split(':')
                    if parts[0].strip().isdigit():
                        if not first_code:
                            first_code = l
                        last_code = l
                print(f"Step {step} VIEW output: first={first_code[:60]} last={last_code[:60]}")
            elif stype == "PLANNER_RESPONSE":
                tcs = obj.get("tool_calls", [])
                for tc in tcs:
                    if "AppHeader" in str(tc):
                        name = tc.get('name')
                        args = tc.get('args', {})
                        sl = args.get('StartLine')
                        el = args.get('EndLine')
                        print(f"Step {step} TC: {name} StartLine={sl} EndLine={el}")
