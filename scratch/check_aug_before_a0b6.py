import os, glob, json, datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

aug_edits = []
for s in sessions:
    sess_id = s.split(os.sep)[-4]
    mtime = os.path.getmtime(s)
    dt = datetime.datetime.fromtimestamp(mtime)
    if datetime.datetime(2026, 8, 1) <= dt <= datetime.datetime(2026, 8, 18, 20, 0):
        try:
            with open(s, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "FinanceDashboard.tsx" in line and ("replace_file_content" in line or "multi_replace_file_content" in line or "write_to_file" in line):
                        d = json.loads(line)
                        for tc in d.get("tool_calls", []):
                            name = tc.get("name")
                            if name in ("replace_file_content", "multi_replace_file_content", "write_to_file"):
                                args = tc.get("args", {})
                                tgt = str(args.get("TargetFile") or "")
                                if "FinanceDashboard.tsx" in tgt:
                                    aug_edits.append((mtime, sess_id, d.get("step_index"), name, args.get("Description", "")))
        except:
            pass

aug_edits.sort(key=lambda x: (x[0], x[2]))
print(f"Total August edits before a0b61b51: {len(aug_edits)}")
for ev in aug_edits:
    dt = datetime.datetime.fromtimestamp(ev[0]).strftime("%Y-%m-%d %H:%M")
    print(f"{dt} | Sess: {ev[1][:8]} | Step: {ev[2]} | Tool: {ev[3]} | {ev[4][:60]}")
