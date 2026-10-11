import json

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\83d63010-919d-406b-8aa3-31dcaa2f3901\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 93:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                print(args.get("Description"))
                for i, ch in enumerate(args.get("ReplacementChunks", [])):
                    print(f"Chunk {i}: lines {ch.get('StartLine')}-{ch.get('EndLine')}")
                    print("Tgt:\n", ch.get("TargetContent"))
                    print("Rep:\n", ch.get("ReplacementContent"))
