import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\9c978313-6497-4767-b550-f862269faef2\.system_generated\logs\transcript_full.jsonl"
views = {}
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (675, 677, 679, 681, 683, 685, 695, 697, 699, 701, 703, 705):
            content = d.get("content", "")
            first_l = content.splitlines()[0] if content else ""
            last_l = content.splitlines()[-1] if content else ""
            print(f"Step {idx}: lines={len(content.splitlines())} | First: {first_l[:40]} | Last: {last_l[:40]}")
