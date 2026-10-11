import json
import sys

f_sep14 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1b70b28-4ef2-4881-9f12-5be2a491c812\.system_generated\logs\transcript_full.jsonl"

with open(f_sep14, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in [383, 384]:
            sys.stdout.buffer.write(f"=== Step {obj.get('step_index')} ({obj.get('type')}) ===\n".encode("utf-8"))
            if obj.get("type") == "PLANNER_RESPONSE":
                sys.stdout.buffer.write(f"TC: {obj.get('tool_calls')}\n".encode("utf-8"))
            elif obj.get("type") == "VIEW_FILE":
                c = obj.get("content", "")
                sys.stdout.buffer.write(c.encode("utf-8"))
