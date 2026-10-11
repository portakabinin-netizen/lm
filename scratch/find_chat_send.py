import os
import json

sessions = [
    r"C:\Users\herry\.gemini\antigravity-ide\brain\c1b70b28-4ef2-4881-9f12-5be2a491c812\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\87dc414c-b99e-4c95-b0db-9470db492619\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\ea288bbb-4d80-4275-bd55-7d4a3429ccf1\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\herry\.gemini\antigravity-ide\brain\5d727c4c-7825-477b-a040-630f1ef2a8cc\.system_generated\logs\transcript_full.jsonl"
]

for s in sessions:
    if not os.path.exists(s): continue
    sname = s.split(os.sep)[-4]
    with open(s, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "service/chat/send" in line and "VIEW_FILE" in line:
                obj = json.loads(line)
                content = obj.get("content", "")
                print(f"=== Found in {sname} step {obj.get('step_index')} ===")
                for l in content.splitlines():
                    if any(w in l for w in ['chat/send', 'recipientId', 'logGeoTickToSQLite', 'Promise.allSettled', 'catch (']):
                        print(" ", l)
