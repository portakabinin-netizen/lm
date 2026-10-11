import json

session_path = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"

with open(session_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":4' in line:
            obj = json.loads(line)
            if obj.get("type") == "VIEW_FILE":
                c = obj.get("content", "")
                lines = c.splitlines()
                print("Step 4 total lines in content:", len(lines))
                for l in lines[:60]:
                    print(l)
                print("...")
                for l in lines[-30:]:
                    print(l)
