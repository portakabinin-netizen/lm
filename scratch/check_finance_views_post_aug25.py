import os, glob, json, datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

finance_views = []
for s in sessions:
    sess_id = s.split(os.sep)[-4]
    mtime = os.path.getmtime(s)
    dt = datetime.datetime.fromtimestamp(mtime)
    if dt >= datetime.datetime(2026, 8, 25):
        try:
            with open(s, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "FinanceDashboard.tsx" in line and "view_file" in line:
                        d = json.loads(line)
                        for tc in d.get("tool_calls", []):
                            if tc.get("name") == "view_file":
                                args = tc.get("args", {})
                                if "FinanceDashboard.tsx" in str(args.get("AbsolutePath", "")):
                                    finance_views.append((mtime, sess_id, d.get("step_index"), args.get("StartLine"), args.get("EndLine")))
        except:
            pass

finance_views.sort(key=lambda x: (x[0], x[2]))
print(f"Total views of FinanceDashboard from Aug 25 onwards: {len(finance_views)}")
for ev in finance_views:
    dt = datetime.datetime.fromtimestamp(ev[0]).strftime("%Y-%m-%d %H:%M")
    print(f"{dt} | Sess: {ev[1][:8]} | Step: {ev[2]} | Lines: {ev[3]} to {ev[4]}")
