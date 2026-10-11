import json

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open("c:/hipk/scratch/step641_out.txt", "w", encoding="utf-8") as out:
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            d = json.loads(line)
            if d.get("step_index") == 641:
                for tc in d.get("tool_calls", []):
                    args = tc.get("args", {})
                    for chunk in args.get("ReplacementChunks", []):
                        out.write(f"--- Chunk StartLine {chunk.get('StartLine')} ---\n")
                        out.write(chunk.get("ReplacementContent") + "\n\n")
