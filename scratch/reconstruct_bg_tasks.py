import os
import json

sessions = [
    r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\c1b70b28-4ef2-4881-9f12-5be2a491c812\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\87dc414c-b99e-4c95-b0db-9470db492619\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\ea288bbb-4d80-4275-bd55-7d4a3429ccf1\.system_generated\logs\transcript_full.jsonl"
]

for s in sessions:
    if not os.path.exists(s):
        continue
    sname = s.split(os.sep)[-4]
    with open(s, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "BackgroundTasks.ts" in line:
                try:
                    obj = json.loads(line)
                    if obj.get("type") == "VIEW_FILE":
                        c = obj.get("content", "")
                        lines = [l for l in c.splitlines() if l.strip()]
                        line_nums = []
                        for l in lines:
                            p = l.split(':')[0].strip()
                            if p.isdigit():
                                line_nums.append(int(p))
                        if line_nums:
                            print(f"Session {sname} step {obj.get('step_index')}: lines {min(line_nums)} to {max(line_nums)}")
                except:
                    pass
