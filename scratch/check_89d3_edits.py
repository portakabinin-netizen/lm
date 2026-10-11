import json

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        for tc in d.get("tool_calls", []):
            name = tc.get("name")
            if name in ("replace_file_content", "multi_replace_file_content"):
                args = tc.get("args", {})
                tgt_file = args.get("TargetFile", "")
                if "VoucherEntryModal.tsx" in tgt_file:
                    print(f"\nStep {idx}: {name} - {args.get('Description')}")
                    chunks = args.get("ReplacementChunks")
                    if chunks:
                        for i, ch in enumerate(chunks):
                            print(f"  Chunk {i}: lines {ch.get('StartLine')}-{ch.get('EndLine')}")
                            print("  TGT:", ch.get("TargetContent", "")[:80])
                            print("  REP:", ch.get("ReplacementContent", "")[:80])
                    else:
                        print(f"  Lines {args.get('StartLine')}-{args.get('EndLine')}")
                        print("  TGT:", args.get("TargetContent", "")[:80])
                        print("  REP:", args.get("ReplacementContent", "")[:80])
