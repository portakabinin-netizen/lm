import json

f = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

with open(f, "r", encoding="utf-8", errors="ignore") as fp:
    for line in fp:
        obj = json.loads(line)
        if obj.get("step_index") == 816:
            c = obj.get("content", "")
            for l in c.splitlines()[:25]:
                print(l)
            break
