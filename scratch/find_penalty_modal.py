import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "PenaltyRegisterModal" in line:
            obj = json.loads(line)
            print(f"Step {obj.get('step_index')}:")
            c = obj.get("content", "")
            lines = c.splitlines()
            for l in lines[:25]:
                print("  ", l)
            break
