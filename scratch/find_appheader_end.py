import os
import json

sessions = [
    r"C:\Users\herry\.gemini\antigravity-ide\brain\51de807f-d55d-4095-bf41-e5d0ad1fece9\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\d1c1d7a2-7554-4771-84a0-505e7b03dede\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\54228bae-c3b6-4f23-8928-d9ceaad7f9a7\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\185ad980-f415-4283-88ec-1d6524575f0d\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\542ebb05-48bf-4dc7-bd6b-a9e15a45f6eb\.system_generated\logs\transcript_full.jsonl"
]

for s in sessions:
    if not os.path.exists(s):
        continue
    sname = s.split(os.sep)[-4]
    with open(s, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "AppHeader.tsx" in line:
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
