import os, json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
for item in os.listdir(brain_dir):
    p = os.path.join(brain_dir, item, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(p):
        continue
    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "VoucherEntryModal.tsx" in line and "view_file" in line:
                    d = json.loads(line)
                    idx = d.get("step_index")
                    for tc in d.get("tool_calls", []):
                        if tc.get("name") == "view_file":
                            args = tc.get("args", {})
                            if "VoucherEntryModal.tsx" in str(args.get("AbsolutePath", "")):
                                sl = args.get("StartLine", 0)
                                el = args.get("EndLine", 0)
                                if (el and int(el) > 1050) or (sl and int(sl) > 1050) or (not el and not sl):
                                    print(f"{item[:8]} | Step {idx} | Start: {sl}, End: {el} | Desc: {args.get('toolAction')}")
    except Exception as e:
        pass
