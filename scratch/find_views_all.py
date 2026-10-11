import os, glob, json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

def find_views(file_name):
    print(f"=== Views for {file_name} ===")
    sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))
    results = []
    for s in sessions:
        sess_id = s.split(os.sep)[-4]
        try:
            mtime = os.path.getmtime(s)
            with open(s, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if file_name in line and "view_file" in line:
                        d = json.loads(line)
                        for tc in d.get("tool_calls", []):
                            if tc.get("name") == "view_file":
                                args = tc.get("args", {})
                                tgt = args.get("AbsolutePath", "")
                                if file_name in tgt:
                                    s_line = args.get("StartLine")
                                    e_line = args.get("EndLine")
                                    results.append((mtime, sess_id, d.get("step_index"), s_line, e_line))
        except Exception as e:
            pass
    results.sort(key=lambda x: (x[0], x[2]))
    import datetime
    for r in results:
        dt = datetime.datetime.fromtimestamp(r[0]).strftime("%Y-%m-%d %H:%M")
        print(f"{dt} | Sess: {r[1][:8]} | Step: {r[2]} | Lines: {r[3]} to {r[4]}")

if __name__ == "__main__":
    find_views("VoucherEntryModal.tsx")
    print("\n" + "="*50 + "\n")
    find_views("FinanceDashboard.tsx")
