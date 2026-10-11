import os
import json
import re

history_dir = r"c:\hipk\history\frontend_snapshots"
f_a2 = r"C:\Users\herry\.gemini\antigravity-ide\brain\a23079d7-e2d0-4e09-8cae-4beb91691e13\.system_generated\logs\transcript_full.jsonl"
lines_map = {}

with open(f_a2, "r", encoding="utf-8", errors="ignore") as fp:
    for line in fp:
        if "AppHeader.tsx" in line and '"type":"VIEW_FILE"' in line:
            obj = json.loads(line)
            content = obj.get("content", "")
            for l in content.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_map[int(m.group(1))] = m.group(2)

print(f"Total distinct lines collected for v691: {len(lines_map)} / 691")
missing = [i for i in range(1, 692) if i not in lines_map]
print("Missing lines:", missing)

if len(lines_map) >= 650:
    # Fill any small gaps if needed
    max_line = max(lines_map.keys())
    v691_code = "\n".join([lines_map.get(i, "") for i in range(1, max_line + 1)]) + "\n"
    out_path = os.path.join(history_dir, "AppHeader_v691_sep18.tsx")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(v691_code)
    print(f"Saved complete AppHeader_v691_sep18.tsx: {max_line} lines, {len(v691_code)} bytes")
