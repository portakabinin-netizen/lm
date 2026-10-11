import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = ["c1868f3b-9dde-4eb0-b055-98666af278ca", "924d6424-27a0-4913-9bdf-a2ce3aee4056", "51de807f-cf12-4c28-98e8-efb0451e5ea1", "153e79b4-00e0-41c6-ba97-4b8b7083ff82"]

for sid in sessions:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "PenaltyRegisterModal" in line or "ProjectGalleryModal" in line:
                if '"type":"REPLACE_FILE_CONTENT"' in line or '"type":"MULTI_REPLACE_FILE_CONTENT"' in line:
                    print(f"Mod found in {sid}:", line[:120])
