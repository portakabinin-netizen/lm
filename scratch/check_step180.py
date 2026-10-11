import json

log_file = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"
with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":180' in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            lines = c.splitlines()
            print("Step 180 lines 2870 to 2900:")
            for l in lines:
                if any(f"{n}:" in l for n in range(2870, 2901)):
                    print(l)
