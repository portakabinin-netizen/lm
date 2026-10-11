import json, os, re

sessions = [
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
    "89d39ee6-698d-4d6a-8eae-5141dc08fca6",
    "a5cf669f-863d-4d0f-9e38-d981d91feaab",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
]

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
for sid in sessions:
    p = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(p): continue
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "updateEntry(entry.id, { amount" in line and "VIEW_FILE" in line:
                d = json.loads(line)
                c = d.get("content", "")
                c_lines = c.splitlines()
                for i, l in enumerate(c_lines):
                    if "updateEntry(entry.id, { amount" in l:
                        print(f"[{sid[:4]}] Step {d.get('step_index')}:")
                        for j in range(max(0, i - 2), min(len(c_lines), i + 25)):
                            print("  ", c_lines[j])
                        break
