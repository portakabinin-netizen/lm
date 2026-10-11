import json

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 641:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                chunks = args.get("ReplacementChunks", [])
                print(f"Step 641 has {len(chunks)} chunks:")
                for i, ch in enumerate(chunks):
                    tgt = ch.get("TargetContent", "")
                    rep = ch.get("ReplacementContent", "")
                    print(f"  Chunk {i}: lines {ch.get('StartLine')}-{ch.get('EndLine')}, tgt lines={len(tgt.splitlines())}, rep lines={len(rep.splitlines())}")
                    print(f"    Tgt start: {tgt.splitlines()[0] if tgt.splitlines() else ''}")
                    print(f"    Rep start: {rep.splitlines()[0] if rep.splitlines() else ''}")
