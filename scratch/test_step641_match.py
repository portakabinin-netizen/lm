import json

with open("modal/VoucherEntryModal.tsx", "r", encoding="utf-8") as f:
    current_content = f.read()

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 641:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                for ch in args.get("ReplacementChunks", []):
                    tgt = ch.get("TargetContent")
                    print("Tgt found in current file?", tgt in current_content)
                    if tgt not in current_content:
                        # find where it diverges
                        for l in tgt.splitlines()[:5]:
                            print("  tgt line:", l, "in cur?", l in current_content)
