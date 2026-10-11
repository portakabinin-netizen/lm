import os
import json

tf_924d = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"
with open(tf_924d, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            lines = c.splitlines()
            first = lines[0] if lines else ""
            last = lines[-1] if lines else ""
            # find line number range
            lns = []
            for l in lines:
                parts = l.split(":", 1)
                if len(parts) == 2 and parts[0].strip().isdigit():
                    lns.append(int(parts[0].strip()))
            if lns:
                print(f"step {obj.get('step_index')}: {min(lns)} to {max(lns)} (total {len(lns)} lines)")
