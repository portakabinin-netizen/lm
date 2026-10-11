import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
candidates = ["b986fc50-87b2-4dcb-b9ec-04c42ce44298", "a5cf669f-863d-4d0f-9e38-d981d91feaab", "964617eb-49c1-45b7-ae8e-54b619636bc4"]

for sid in candidates:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                if "Total Lines:" in c:
                    for first_l in c.splitlines()[:5]:
                        if "Total Lines:" in first_l or "Showing lines" in first_l:
                            print(sid, f"step {obj.get('step_index')}:", first_l)
