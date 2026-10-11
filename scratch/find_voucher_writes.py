import os, glob, json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript_full.jsonl"))

for s in sessions:
    sess_id = s.split(os.sep)[-4]
    try:
        with open(s, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "VoucherEntryModal" in line and "write_to_file" in line:
                    d = json.loads(line)
                    for tc in d.get("tool_calls", []):
                        if tc.get("name") == "write_to_file":
                            args = tc.get("args", {})
                            tgt = args.get("TargetFile", "")
                            if "VoucherEntryModal" in tgt:
                                print(f"Sess: {sess_id} | Step: {d.get('step_index')} | write_to_file: {tgt} | len: {len(args.get('CodeContent',''))}")
    except Exception as e:
        pass
