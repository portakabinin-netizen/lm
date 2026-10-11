import os
import json

sessions = [
    r"C:\Users\herry\.gemini\antigravity-ide\brain\51de807f-d55d-4095-bf41-e5d0ad1fece9\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\542ebb05-48bf-4dc7-bd6b-a9e15a45f6eb\.system_generated\logs\transcript_full.jsonl"
]

for s in sessions:
    if not os.path.exists(s):
        continue
    print(f"=== Checking {os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(s))))} ===")
    with open(s, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "AppHeader.tsx" in line:
                try:
                    obj = json.loads(line)
                    step = obj.get("step_index")
                    stype = obj.get("type")
                    if stype == "VIEW_FILE":
                        content = obj.get("content", "")
                        print(f"  Step {step}: VIEW_FILE lines={len(content.splitlines())} bytes={len(content)}")
                    elif stype == "PLANNER_RESPONSE":
                        for tc in obj.get("tool_calls", []):
                            if "AppHeader" in str(tc):
                                print(f"  Step {step}: PLANNER_RESPONSE {tc.get('name')}")
                    elif stype == "CODE_ACTION":
                        print(f"  Step {step}: CODE_ACTION")
                except:
                    pass
