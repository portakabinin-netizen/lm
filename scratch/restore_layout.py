import json
import re

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\51de807f-d55d-4095-bf41-e5d0ad1fece9\.system_generated\logs\transcript_full.jsonl"
steps = [338, 340, 342]

code_lines = {}
with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in steps:
            content = obj.get("content", "")
            for l in content.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    code_lines[int(m.group(1))] = m.group(2)

print(f"Total lines parsed: {len(code_lines)}")
full_code = "\n".join([code_lines[i] for i in range(1, len(code_lines) + 1)]) + "\n"

target_path = r"c:\hipk\app\_layout.tsx"
with open(target_path, "w", encoding="utf-8") as f:
    f.write(full_code)

print(f"Restored {target_path}: {len(code_lines)} lines, {len(full_code)} bytes")
