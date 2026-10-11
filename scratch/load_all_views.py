import json, os, sys
sys.path.append('.')
from scratch.check_harvested import ranges, lines_dict

def get_transcript(sid):
    p = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript_full.jsonl"
    if os.path.exists(p): return p
    return rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript.jsonl"

# Let's inspect each gap in 36afcdb8, c7e1b051, 9c978313, 9091031b
sessions = [
    "9091031b-b865-4df4-a8eb-694f9d8e6dea",
    "9c978313-6497-4767-b550-f862269faef2",
    "7989469f-5ee3-4cd7-b2ee-28be1a1400be",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
]

# We will collect all views from these sessions
all_views = {}
for sid in sessions:
    p = get_transcript(sid)
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "VIEW_FILE" in line:
                d = json.loads(line)
                c = d.get("content", "")
                for l in c.splitlines():
                    if ": " in l:
                        parts = l.split(": ", 1)
                        if parts[0].strip().isdigit():
                            num = int(parts[0].strip())
                            if sid not in all_views: all_views[sid] = {}
                            all_views[sid][num] = parts[1]

print("Views loaded from sessions:")
for sid in all_views:
    print(f"  {sid[:8]}: {len(all_views[sid])} lines")
