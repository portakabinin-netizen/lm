import json

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\a23079d7-e2d0-4e09-8cae-4beb91691e13\.system_generated\logs\transcript_full.jsonl"

views = []
with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "AppHeader.tsx" in line:
            obj = json.loads(line)
            step = obj.get("step_index")
            stype = obj.get("type")
            if stype == "PLANNER_RESPONSE":
                tcs = obj.get("tool_calls", [])
                for tc in tcs:
                    if "AppHeader" in str(tc) and tc.get('name') in ['view_file', 'write_to_file', 'replace_file_content']:
                        print(f"Step {step} TC: {tc.get('name')} {tc.get('args')}")
            elif stype == "VIEW_FILE":
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
                print(f"Step {step} VIEW: first={first_code[:50]} last={last_code[:50]}")
