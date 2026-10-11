import json, os

# Let's extract the exact lines from session 9c978313 and 9091031b
path_9c = r"C:\Users\herry\.gemini\antigravity-ide\brain\9c978313-6497-4767-b550-f862269faef2\.system_generated\logs\transcript_full.jsonl"
path_90 = r"C:\Users\herry\.gemini\antigravity-ide\brain\9091031b-b865-4df4-a8eb-694f9d8e6dea\.system_generated\logs\transcript_full.jsonl"
path_36 = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"

lines_dict = {}

def harvest_from_transcript(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "Total Lines: 148" in line:
                d = json.loads(line)
                content = d.get("content", "")
                for l in content.splitlines():
                    if ": " in l:
                        p = l.split(": ", 1)
                        if p[0].strip().isdigit():
                            l_num = int(p[0].strip())
                            lines_dict[l_num] = p[1]

# Harvest from 9091031b (Total Lines: 1483) first, then 9c978313 (Total Lines: 1480/1478)
harvest_from_transcript(path_90)
print(f"From 9091031b: {len(lines_dict)} lines")
harvest_from_transcript(path_9c)
print(f"From 9091031b + 9c978313: {len(lines_dict)} lines")
