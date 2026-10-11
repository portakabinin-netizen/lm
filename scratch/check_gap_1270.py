import os
import json
import re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

# 1. Look around line 1270 in 4024 version:
# What is around line 1270?
# Step 597 of c1868f3b showed lines 1220 to 1270.
# Step 540 of c1868f3b showed lines 1280 to 1340.
# Let's inspect the end of 1220-1270 and start of 1280-1340!

log_c1868 = os.path.join(brain_dir, "c1868f3b-9dde-4eb0-b055-98666af278ca", ".system_generated", "logs", "transcript_full.jsonl")
with open(log_c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":597' in line or '"step_index":540' in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            lines = c.splitlines()
            print(f"=== Step {obj.get('step_index')} ===")
            if obj.get("step_index") == 597:
                for l in lines[-12:]:
                    print(l)
            else:
                for l in lines[:15]:
                    print(l)
