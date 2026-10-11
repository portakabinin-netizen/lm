import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = ["924d6424-27a0-4913-9bdf-a2ce3aee4056", "c1868f3b-9dde-4eb0-b055-98666af278ca"]

for sid in sessions:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if "950:" in c or "945:" in c:
                    print(f"{sid} step {obj.get('step_index')}:")
                    for l in c.splitlines():
                        parts = l.split(":", 1)
                        if len(parts) == 2 and parts[0].strip().isdigit():
                            num = int(parts[0].strip())
                            if 940 <= num <= 965:
                                print(f"  {l}")
                    break
