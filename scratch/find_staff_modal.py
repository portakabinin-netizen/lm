import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
for sid in os.listdir(brain_dir):
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                if "Total Lines: 4024" in line or "Total Lines: 4401" in line:
                    for l in line.split(r"\n"):
                        parts = l.split(":", 1)
                        if len(parts) == 2 and parts[0].strip().isdigit():
                            num = int(parts[0].strip())
                            if 850 <= num <= 900:
                                print(f"Found lines in {sid}")
                                break
