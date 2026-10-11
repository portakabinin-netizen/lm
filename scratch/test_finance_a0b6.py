import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 107:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                code = args.get("CodeContent", "")
                base_text = code.replace("\r\n", "\n")
                break

print(f"Base text from step 107 has {len(base_text.splitlines())} lines.")

# Collect all edits in a0b61b51 after step 107
edits = []
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx > 107:
            for tc in d.get("tool_calls", []):
                name = tc.get("name")
                if name in ("replace_file_content", "multi_replace_file_content"):
                    args = tc.get("args", {})
                    tgt = str(args.get("TargetFile") or "")
                    if "FinanceDashboard.tsx" in tgt:
                        edits.append((idx, name, args))

print(f"Total edits in a0b61b51: {len(edits)}")

text = base_text
success = 0
for idx, name, args in edits:
    desc = args.get("Description", "")[:50]
    if name == "replace_file_content":
        tgt = args.get("TargetContent", "").replace("\r\n", "\n")
        rep = args.get("ReplacementContent", "").replace("\r\n", "\n")
        if tgt in text:
            text = text.replace(tgt, rep)
            print(f"[OK] Step {idx}: replace - {desc}")
            success += 1
        else:
            print(f"[ERR] Step {idx}: replace - {desc}")
            print(f"  Tgt:\n{tgt[:150]}")
            break
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks", [])
        temp_text = text
        failed = False
        for c_idx, ch in enumerate(chunks):
            tgt = ch.get("TargetContent", "").replace("\r\n", "\n")
            rep = ch.get("ReplacementContent", "").replace("\r\n", "\n")
            if tgt in temp_text:
                temp_text = temp_text.replace(tgt, rep)
            else:
                print(f"[ERR] Step {idx} chunk {c_idx}")
                failed = True
                break
        if not failed:
            text = temp_text
            print(f"[OK] Step {idx}: multi_replace - {desc}")
            success += 1
        else:
            break

print(f"\na0b61b51 replay: {success}/{len(edits)} succeeded. Total lines: {len(text.splitlines())}")
