import json

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\9c978313-6497-4767-b550-f862269faef2\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 684: # Step 684 was view_file 1-70
            print("Type:", d.get("type"))
            print("Content preview:", d.get("content", "")[:200])
        elif d.get("step_index") == 685: # tool response?
            print("Step 685 type:", d.get("type"))
            print("Step 685 content preview:", d.get("content", "")[:200])
