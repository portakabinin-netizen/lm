import json
import re

def extract_lines(file_path, step_index):
    code_map = {}
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            obj = json.loads(line)
            if obj.get("step_index") == step_index:
                content = obj.get("content", "")
                for l in content.splitlines():
                    m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                    if m:
                        code_map[int(m.group(1))] = m.group(2)
                break
    return code_map

f_sep30 = r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl"
f_sep14 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1b70b28-4ef2-4881-9f12-5be2a491c812\.system_generated\logs\transcript_full.jsonl"
f_sep12 = r"C:\Users\herry\.gemini\antigravity-ide\brain\ea288bbb-4d80-4275-bd55-7d4a3429ccf1\.system_generated\logs\transcript_full.jsonl"

# 1. Base from Sep 30:
lines_470 = extract_lines(f_sep30, 470) # 1-100
lines_472 = extract_lines(f_sep30, 472) # 130-250
lines_474 = extract_lines(f_sep30, 474) # 270-369

print(f"470 lines: {len(lines_470)} (range {min(lines_470.keys())}-{max(lines_470.keys())})")
print(f"472 lines: {len(lines_472)} (range {min(lines_472.keys())}-{max(lines_472.keys())})")
print(f"474 lines: {len(lines_474)} (range {min(lines_474.keys())}-{max(lines_474.keys())})")

# 2. Missing lines 101-129:
lines_sep14_386 = extract_lines(f_sep14, 386) # 50-140
print(f"sep14 386 lines: {len(lines_sep14_386)} (range {min(lines_sep14_386.keys())}-{max(lines_sep14_386.keys())})")

# 3. Missing lines 251-269:
lines_sep12_213 = extract_lines(f_sep12, 213) # 240-286
print(f"sep12 213 lines: {len(lines_sep12_213)} (range {min(lines_sep12_213.keys())}-{max(lines_sep12_213.keys())})")

# Assemble all 1 to 369 lines:
assembled = {}
assembled.update(lines_470)
for i in range(101, 130):
    if i in lines_sep14_386:
        assembled[i] = lines_sep14_386[i]
    else:
        print(f"Missing {i}!")
assembled.update(lines_472)
for i in range(251, 270):
    if i in lines_sep12_213:
        assembled[i] = lines_sep12_213[i]
    else:
        print(f"Missing {i}!")
assembled.update(lines_474)

print(f"Total assembled lines: {len(assembled)} / 369")
missing = [i for i in range(1, 370) if i not in assembled]
print(f"Missing lines: {missing}")

# Check lines around boundaries
print("Line 100:", assembled.get(100))
print("Line 101:", assembled.get(101))
print("Line 129:", assembled.get(129))
print("Line 130:", assembled.get(130))
print("Line 250:", assembled.get(250))
print("Line 251:", assembled.get(251))
print("Line 269:", assembled.get(269))
print("Line 270:", assembled.get(270))
