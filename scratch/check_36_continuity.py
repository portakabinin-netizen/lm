import json, re

p_36 = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"
steps_needed = [422, 424, 426, 428, 474, 476, 432, 430]

lines = {}
with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in steps_needed and d.get("type") == "VIEW_FILE":
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines[int(m.group(1))] = m.group(2)

print(f"Total lines: {len(lines)}")
print(f"Min: {min(lines.keys())}, Max: {max(lines.keys())}")
missing = [i for i in range(1, 1101) if i not in lines]
print(f"Missing lines between 1 and 1100: {len(missing)}")
if missing:
    print("Missing:", missing)
