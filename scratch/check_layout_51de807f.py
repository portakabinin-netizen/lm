import json
import re

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\51de807f-d55d-4095-bf41-e5d0ad1fece9\.system_generated\logs\transcript_full.jsonl"
steps = [337, 338, 339, 340, 341, 342]

with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        st = obj.get("step_index")
        if st in steps:
            print(f"Step {st} ({obj.get('type')}):")
            if obj.get("type") == "PLANNER_RESPONSE":
                print("  Tool calls:", obj.get("tool_calls"))
            elif obj.get("type") == "VIEW_FILE":
                c = obj.get("content", "")
                cl = [l for l in c.splitlines() if l.strip()]
                line_nums = []
                for l in cl:
                    p = l.split(':')[0].strip()
                    if p.isdigit():
                        line_nums.append(int(p))
                if line_nums:
                    print(f"  Lines {min(line_nums)} to {max(line_nums)}")
