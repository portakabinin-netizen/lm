import os
import json

sessions = [
    'c1868f3b-9dde-4eb0-b055-98666af278ca',
    '51de807f-d55d-4095-bf41-e5d0ad1fece9',
    '924d6424-27a0-4913-9bdf-a2ce3aee4056',
    '153e79b4-00e0-41c6-ba97-4b8b7083ff82'
]

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

for sid in sessions:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                lines = c.splitlines()
                sl = None
                for l in lines[:10]:
                    if "Showing lines" in l:
                        sl = l
                print(f"{sid} Step {obj.get('step_index')}: {sl}")
