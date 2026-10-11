import json

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\9979a84a-578a-4ae6-a2aa-6c88ca067103\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("type") == "USER_INPUT":
            content = d.get("content", "")
            print(f"Step {d.get('step_index')}: {content[:200]}")
