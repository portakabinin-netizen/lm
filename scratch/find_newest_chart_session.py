import os, glob, json, sys

sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r'C:\Users\herry\.gemini\antigravity-ide\brain'

sessions_found = []

for session_id in os.listdir(brain_dir):
    log_dir = os.path.join(brain_dir, session_id, '.system_generated', 'logs')
    t_file = os.path.join(log_dir, 'transcript.jsonl')
    if os.path.exists(t_file):
        # Quick check if FinancialComparisonLineChart is mentioned
        with open(t_file, 'r', encoding='utf-8') as f:
            for line in f:
                if 'FinancialComparisonLineChart' in line:
                    mtime = os.path.getmtime(t_file)
                    sessions_found.append((mtime, session_id))
                    break

sessions_found.sort(reverse=True)
print("Sessions with FinancialComparisonLineChart (newest first):")
for mtime, sid in sessions_found[:10]:
    import datetime
    dt = datetime.datetime.fromtimestamp(mtime)
    print(f"  {dt.isoformat()} - {sid}")
