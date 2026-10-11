import os
import json

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\964617eb-49c1-45b7-ae8e-54b619636bc4\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            if obj.get("step_index") in [664, 700]:
                print(f"=== STEP {obj.get('step_index')} ===")
                c = obj.get("content", "")
                lines = c.splitlines()
                print(lines[5]) # Showing lines ...
                for l in lines[6:25]:
                    print("  ", l)
                print("   ...")
                for l in lines[-10:]:
                    print("  ", l)
