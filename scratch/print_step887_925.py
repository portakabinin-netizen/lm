import json

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(p, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (887, 925):
            print(f"==================== STEP {idx} ====================")
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                for chunk in args.get("ReplacementChunks", []):
                    print(f"--- Chunk StartLine {chunk.get('StartLine')} ---")
                    print(chunk.get("ReplacementContent"))
