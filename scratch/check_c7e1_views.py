import json, re

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\c7e1b051-8b6d-4cde-950c-c303c5a89ff7\.system_generated\logs\transcript_full.jsonl"
views = {}
with open(p, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in range(300, 365) and d.get("type") == "VIEW_FILE":
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    views[int(m.group(1))] = m.group(2)

print(f"Total lines viewed in c7e1b051 between 300 and 365: {len(views)}")
if views:
    v_lines = sorted(views.keys())
    print(f"Min: {v_lines[0]}, Max: {v_lines[-1]}")
    missing = [i for i in range(v_lines[0], v_lines[-1] + 1) if i not in views]
    print(f"Missing lines count in range: {len(missing)}")
    if missing:
        print("Missing lines:", missing[:20])
