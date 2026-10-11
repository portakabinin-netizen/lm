import os
import json

sessions = [
    ("171778d8-f231-4239-8139-12caa2b594da", 1539),
    ("e10e229c-a314-4829-8879-eabd9bfcc598", 186),
    ("964617eb-49c1-45b7-ae8e-54b619636bc4", 666)
]

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
for sid, step in sessions:
    tf = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(tf): continue
    with open(tf, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if f'"step_index":{step}' in line:
                obj = json.loads(line)
                c = obj.get("content", "")
                lines = c.splitlines()
                print(f"=== {sid} step {step} ===")
                for l in lines[:5]:
                    print("  ", l)
