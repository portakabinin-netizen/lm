import json

session_path = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"

with open(session_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":253' in line:
            obj = json.loads(line)
            tc = obj.get("tool_calls", [{}])[0]
            chunks = tc.get("args", {}).get("ReplacementChunks", [])
            print("Step 253 multi_replace chunks:", len(chunks))
            for i, ch in enumerate(chunks):
                sl = ch.get("StartLine")
                el = ch.get("EndLine")
                tgt = ch.get("TargetContent", "")
                repl = ch.get("ReplacementContent", "")
                print(f"Chunk {i}: lines {sl}-{el} | Target lines={len(tgt.splitlines())} Repl lines={len(repl.splitlines())}")
                print("Target snippet:", repr(tgt[:100]))
