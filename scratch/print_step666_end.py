import os
import json

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\964617eb-49c1-45b7-ae8e-54b619636bc4\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":666' in line:
            obj = json.loads(line)
            for l in obj.get("content", "").splitlines():
                if any(f"{n}:" in l for n in range(920, 931)):
                    print(l)
