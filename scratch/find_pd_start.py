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
                if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                    if "Showing lines 1 to" in line or "Showing lines 0 to" in line:
                        obj = json.loads(line)
                        c = obj.get("content", "")
                        print(f"=== {d} Step {obj.get('step_index')} ===")
                        for l in c.splitlines()[:35]:
                            print(l)
    except:
        pass
