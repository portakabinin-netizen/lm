import json

for sess_id in ["153e79b4-00e0-41c6-ba97-4b8b7083ff82", "e5acc5e7-0920-4441-ac6a-1791a146459a", "d1c1d7a2-7554-4771-84a0-505e7b03dede"]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    print(f"\n=== Session {sess_id} ===")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            d = json.loads(line)
            if d.get("type") == "USER_INPUT":
                print("USER_INPUT:", d.get("content", "")[:300])
