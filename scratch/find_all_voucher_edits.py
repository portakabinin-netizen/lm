import os, glob, json, datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

all_v_edits = []
for s in sessions:
    sess_id = s.split(os.sep)[-4]
    mtime = os.path.getmtime(s)
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
                                all_v_edits.append((mtime, sess_id, d.get("step_index"), tc.get("name"), args.get("Description", "")))
    except:
        pass

all_v_edits.sort(key=lambda x: (x[0], x[2]))
print(f"Total VoucherEntryModal edits found across ALL sessions: {len(all_v_edits)}")
for ev in all_v_edits:
    dt = datetime.datetime.fromtimestamp(ev[0]).strftime("%Y-%m-%d %H:%M")
    print(f"{dt} | Sess: {ev[1][:8]} | Step: {ev[2]} | Tool: {ev[3]} | {ev[4][:65]}")
