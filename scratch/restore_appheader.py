import json
import re

s = r"C:\Users\herry\.gemini\antigravity-ide\brain\54228bae-c3b6-4f23-8928-d9ceaad7f9a7\.system_generated\logs\transcript_full.jsonl"
target_file = r"c:\hipk\components\AppHeader.tsx"

with open(s, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 35:
            content = obj.get("content", "")
            raw_lines = content.splitlines()
            code_lines = []
            for l in raw_lines:
                # Format is "line_number: original_code"
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    code_lines.append(m.group(2))
            
            full_code = "\n".join(code_lines) + "\n"
            with open(target_file, "w", encoding="utf-8") as out:
                out.write(full_code)
            print(f"Successfully restored {target_file}: {len(code_lines)} lines, {len(full_code)} bytes")
            break
