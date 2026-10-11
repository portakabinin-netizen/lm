import json

sessions = [
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "9c978313-6497-4767-b550-f862269faef2",
    "9091031b-b865-4df4-a8eb-694f9d8e6dea",
]

lines_dict = {}

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "Total Lines:" in line:
                d = json.loads(line)
                content = d.get("content", "")
                for l in content.splitlines():
                    if ": " in l:
                        p = l.split(": ", 1)
                        if p[0].strip().isdigit():
                            l_num = int(p[0].strip())
                            lines_dict[l_num] = (sess_id[:8], d.get("step_index"), p[1])

print(f"Total distinct line numbers captured: {len(lines_dict)} / 1483")
# Find missing line ranges
missing = []
cur_start = None
for i in range(1, 1484):
    if i not in lines_dict:
        if cur_start is None:
            cur_start = i
    else:
        if cur_start is not None:
            missing.append((cur_start, i - 1))
            cur_start = None
if cur_start is not None:
    missing.append((cur_start, 1483))

print("Missing line ranges:", missing)
