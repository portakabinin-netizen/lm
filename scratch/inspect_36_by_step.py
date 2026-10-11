import json, re

p_36 = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"
views_by_step = {}

with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if "VoucherEntryModal.tsx" in line and d.get("type") == "VIEW_FILE":
            idx = d.get("step_index")
            c = d.get("content", "")
            step_lines = {}
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    step_lines[int(m.group(1))] = m.group(2)
            if step_lines:
                views_by_step[idx] = step_lines
                print(f"Step {idx}: {len(step_lines)} lines (min {min(step_lines.keys())}, max {max(step_lines.keys())})")
