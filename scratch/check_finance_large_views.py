import json, glob, os

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

view_ranges = []
for s in sessions:
    sess_id = s.split(os.sep)[-4]
    try:
        mtime = os.path.getmtime(s)
        with open(s, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "FinanceDashboard.tsx" in line and "view_file" in line:
                    d = json.loads(line)
                    for tc in d.get("tool_calls", []):
                        if tc.get("name") == "view_file":
                            args = tc.get("args", {})
                            if "FinanceDashboard.tsx" in str(args.get("AbsolutePath", "")):
                                s_line = args.get("StartLine")
                                e_line = args.get("EndLine")
                                view_ranges.append((mtime, sess_id, d.get("step_index"), s_line, e_line))
    except Exception as e:
        pass

view_ranges.sort(key=lambda x: (x[0], x[2]))
import datetime
print(f"Total view_file calls for FinanceDashboard: {len(view_ranges)}")
# Print calls where range > 300 lines or covers beginning/end
for r in view_ranges:
    dt = datetime.datetime.fromtimestamp(r[0]).strftime("%Y-%m-%d %H:%M")
    s, e = r[3], r[4]
    try:
        s_int = int(s) if s is not None else None
        e_int = int(e) if e is not None else None
    except:
        s_int, e_int = None, None
    diff = (e_int - s_int) if (s_int is not None and e_int is not None) else 0
    if diff > 200 or s is None or (e_int and e_int > 5000):
        print(f"{dt} | Sess: {r[1][:8]} | Step: {r[2]} | Lines: {s} to {e} (count={diff})")
