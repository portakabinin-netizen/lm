import os
import json

tf_924d = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"
with open(tf_924d, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            if obj.get("step_index") == 236:
                print(obj.get("content"))
