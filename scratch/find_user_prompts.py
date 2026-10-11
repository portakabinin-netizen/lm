import os
import json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"

for root, dirs, files in os.walk(brain_dir):
    for f in files:
        if f.endswith("transcript_full.jsonl"):
            fp = os.path.join(root, f)
            try:
                with open(fp, "r", encoding="utf-8", errors="ignore") as fp_in:
                    for line in fp_in:
                        if '"type":"USER_INPUT"' in line:
                            l_lower = line.lower()
                            if "project" in l_lower and ("dashboard" in l_lower or "module" in l_lower or "moudle" in l_lower or "modal" in l_lower):
                                obj = json.loads(line)
                                c = obj.get("content", "")
                                dt = obj.get("created_at", "")
                                sid = fp.split(os.sep)[-4]
                                print(f"{dt} | {sid[:8]} | {repr(c[:140])}")
            except:
                pass
