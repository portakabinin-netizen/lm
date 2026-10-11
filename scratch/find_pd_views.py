import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

for d in os.listdir(brain_dir):
    tf = os.path.join(brain_dir, d, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf):
        continue
    try:
        with open(tf, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "ProjectDashboard.tsx" in line:
                    try:
                        obj = json.loads(line)
                        stype = obj.get("type")
                        step = obj.get("step_index")
                        if stype == "VIEW_FILE":
                            content = obj.get("content", "")
                            lines = content.splitlines()
                            total_info = " ".join([l.strip() for l in lines[:10] if "Total Lines:" in l or "Showing lines" in l])
                            print(f"{d} | Step {step} | VIEW_FILE | {total_info}")
                        elif stype == "PLANNER_RESPONSE":
                            for tc in obj.get("tool_calls", []):
                                if "ProjectDashboard.tsx" in str(tc):
                                    print(f"{d} | Step {step} | {tc.get('name')} | {tc.get('args')}")
                    except:
                        pass
    except Exception as e:
        pass
