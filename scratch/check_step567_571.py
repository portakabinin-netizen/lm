import json

f_sep30 = r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl"

with open(f_sep30, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in [567, 571]:
            print(f"=== Step {obj.get('step_index')} ===")
            print(json.dumps(obj.get("tool_calls"), indent=2))
