import json

f_sep14 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1b70b28-4ef2-4881-9f12-5be2a491c812\.system_generated\logs\transcript_full.jsonl"

with open(f_sep14, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 382:
            print("=== Step 382 in c1b70b28 ===")
            content = obj.get("content", "")
            for l in content.splitlines():
                print(l)
