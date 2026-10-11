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

lines_470 = extract_lines(f_sep30, 470) # 1-100
lines_472 = extract_lines(f_sep30, 472) # 130-250
lines_474 = extract_lines(f_sep30, 474) # 270-369
lines_sep14_386 = extract_lines(f_sep14, 386) # 50-140
lines_sep12_213 = extract_lines(f_sep12, 213) # 240-286

assembled = {}
assembled.update(lines_470)
for i in range(101, 130):
    assembled[i] = lines_sep14_386[i]
assembled.update(lines_472)
for i in range(251, 270):
    assembled[i] = lines_sep12_213[i]
assembled.update(lines_474)

code_369 = "\n".join([assembled[i] for i in range(1, 370)]) + "\n"

# Now apply step 567 and step 571 replacements:
with open(f_sep30, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 567:
            tc = obj["tool_calls"][0]["args"]
            tgt = tc["TargetContent"]
            rep = tc["ReplacementContent"]
            if tgt in code_369:
                code_369 = code_369.replace(tgt, rep)
                print("Applied step 567 replacement successfully")
            else:
                print("Step 567 target not found!")
        elif obj.get("step_index") == 571:
            tc = obj["tool_calls"][0]["args"]
            tgt = tc["TargetContent"]
            rep = tc["ReplacementContent"]
            if tgt in code_369:
                code_369 = code_369.replace(tgt, rep)
                print("Applied step 571 replacement successfully")
            else:
                print("Step 571 target not found!")

target_path = r"c:\hipk\UtilServices\BackgroundTasks.ts"
with open(target_path, "w", encoding="utf-8") as f:
    f.write(code_369)

final_lines = code_369.splitlines()
print(f"Restored {target_path}: {len(final_lines)} lines, {len(code_369)} bytes")
