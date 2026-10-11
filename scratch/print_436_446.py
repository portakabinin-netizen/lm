import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            idx = obj.get("step_index")
            if idx in [436, 446]:
                print(f"=== STEP {idx} ===")
                print(obj.get("content"))
