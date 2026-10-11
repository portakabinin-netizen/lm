import json

c1868f3b = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(c1868f3b, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":406' in line:
            obj = json.loads(line)
            for tc in obj.get("tool_calls", []):
                for ch in tc.get("args", {}).get("ReplacementChunks", []):
                    rep = ch.get("ReplacementContent", "")
                    if "activeStaffRes.data" in rep:
                        print("FOUND IN STEP 406:")
                        print(rep)
