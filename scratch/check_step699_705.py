import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\9c978313-6497-4767-b550-f862269faef2\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (699, 705):
            print(f"=== Step {idx} ===")
            content = d.get("content", "")
            for l in content.splitlines()[-15:]:
                print(l)
