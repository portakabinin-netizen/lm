import json
import os

sessions = [
    r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\b7df0bb3-74e3-4259-b188-e3eebba7a1c6\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\a23079d7-e2d0-4e09-8cae-4beb91691e13\.system_generated\logs\transcript_full.jsonl"
]

for s in sessions:
    if not os.path.exists(s): continue
    sname = s.split(os.sep)[-4]
    with open(s, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "getPermanentVCardUri" in line:
                print(f"=== Found in {sname} ===")
                obj = json.loads(line)
                print(obj.get("type"), obj.get("step_index"))
                c = obj.get("content", "")
                for l in c.splitlines():
                    if "getPermanentVCardUri" in l:
                        print(" ", l)
