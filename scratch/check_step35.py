import json

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\54228bae-c3b6-4f23-8928-d9ceaad7f9a7\.system_generated\logs\transcript_full.jsonl"

with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 35:
            content = obj.get("content", "")
            lines = content.splitlines()
            print(f"Step 35 has {len(lines)} lines, {len(content)} bytes")
            print("First 5 lines:")
            for l in lines[:5]:
                print(" ", l)
            print("Last 5 lines:")
            for l in lines[-5:]:
                print(" ", l)
            break
