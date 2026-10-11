import json

f_oct1 = r"C:\Users\herry\.gemini\antigravity-ide\brain\d1c1d7a2-7554-4771-84a0-505e7b03dede\.system_generated\logs\transcript_full.jsonl"

with open(f_oct1, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "appHelper.tsx" in line:
            obj = json.loads(line)
            stype = obj.get("type")
            step = obj.get("step_index")
            if stype == "PLANNER_RESPONSE":
                for tc in obj.get("tool_calls", []):
                    if "appHelper" in str(tc):
                        print(f"Step {step} TC: {tc.get('name')} {tc.get('args')}")
            elif stype == "VIEW_FILE":
                c = obj.get("content", "")
                cl = [l for l in c.splitlines() if l.strip()]
                line_nums = []
                for l in cl:
                    p = l.split(':')[0].strip()
                    if p.isdigit():
                        line_nums.append(int(p))
                if line_nums:
                    print(f"Step {step} VIEW lines {min(line_nums)} to {max(line_nums)}")
