import os, glob, json, datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

july_edits = []
for s in sessions:
    sess_id = s.split(os.sep)[-4]
    mtime = os.path.getmtime(s)
    dt = datetime.datetime.fromtimestamp(mtime)
    if datetime.datetime(2026, 7, 11) <= dt <= datetime.datetime(2026, 7, 31, 23, 59):
        try:
            with open(s, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "VoucherEntryModal.tsx" in line and ("replace_file_content" in line or "multi_replace_file_content" in line):
                        d = json.loads(line)
                        for tc in d.get("tool_calls", []):
                            if tc.get("name") in ("replace_file_content", "multi_replace_file_content"):
                                args = tc.get("args", {})
                                tgt = str(args.get("TargetFile") or "")
                                if "VoucherEntryModal.tsx" in tgt:
                                    july_edits.append((mtime, sess_id, d.get("step_index"), tc.get("name"), args.get("Description", "")))
        except:
            pass

july_edits.sort(key=lambda x: (x[0], x[2]))
print(f"Total July edits found: {len(july_edits)}")
for ev in july_edits:
    dt = datetime.datetime.fromtimestamp(ev[0]).strftime("%Y-%m-%d %H:%M")
    print(f"{dt} | Sess: {ev[1][:8]} | Step: {ev[2]} | Tool: {ev[3]} | {ev[4][:60]}")
