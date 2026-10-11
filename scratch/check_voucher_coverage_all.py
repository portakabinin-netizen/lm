import json

sessions = [
    "89d39ee6-698d-4d6a-8eae-5141dc08fca6",
    "83d63010-919d-406b-8aa3-31dcaa2f3901",
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
    "a0b61b51-0899-4ad8-9363-cddafcf79685",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "7989469f-5ee3-4cd7-b2ee-28be1a1400be",
    "22cc85e5-a305-4455-b27d-47d0f4733a77",
    "9c978313-6497-4767-b550-f862269faef2",
    "9091031b-b865-4df4-a8eb-694f9d8e6dea",
]

lines_dict = {}

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    try:
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
    except:
        pass

print(f"Total distinct line numbers captured: {len(lines_dict)} / 1483")
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
