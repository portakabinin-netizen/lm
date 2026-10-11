import json

tf_c1868 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(tf_c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":436' in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            for l in c.splitlines()[-30:]:
                print(l)
