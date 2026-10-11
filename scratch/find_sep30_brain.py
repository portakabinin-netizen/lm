import os, glob, datetime

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript.jsonl"))

results = []
for s in sessions:
    mtime = os.path.getmtime(s)
    dt = datetime.datetime.fromtimestamp(mtime)
    if dt.year == 2026 and (dt.month == 9 or (dt.month == 10 and dt.day <= 5)):
        sess_id = s.split(os.sep)[-4]
        size_kb = os.path.getsize(s) // 1024
        results.append((mtime, dt, sess_id, size_kb))

results.sort(key=lambda x: x[0])
for mtime, dt, sess_id, size_kb in results:
    print(f"{dt.strftime('%Y-%m-%d %H:%M:%S')} | {sess_id} | {size_kb} KB")
