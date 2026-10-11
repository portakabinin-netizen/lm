import os, glob, json
from datetime import datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = []

for item in os.listdir(brain_dir):
    p = os.path.join(brain_dir, item)
    if os.path.isdir(p):
        t_file = os.path.join(p, ".system_generated", "logs", "transcript.jsonl")
        first_input = ""
        created = ""
        if os.path.exists(t_file):
            try:
                with open(t_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        d = json.loads(line)
                        if not created:
                            created = d.get("created_at", "")
                        if d.get("type") == "USER_INPUT":
                            c = d.get("content", "")
                            # Clean user tags
                            c = c.replace("<USER_REQUEST>", "").replace("</USER_REQUEST>", "").strip()
                            first_input = c.split("\n")[0][:80]
                            break
            except Exception as e:
                first_input = str(e)
        sessions.append((created, item, first_input))

sessions.sort(key=lambda x: x[0])
for s in sessions:
    print(f"{s[0]} | {s[1]} | {s[2]}")
