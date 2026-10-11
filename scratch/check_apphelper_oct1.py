import json
import sys

f_oct1 = r"C:\Users\herry\.gemini\antigravity-ide\brain\d1c1d7a2-7554-4771-84a0-505e7b03dede\.system_generated\logs\transcript_full.jsonl"

with open(f_oct1, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in [30, 31, 32]:
            sys.stdout.buffer.write(f"=== Step {obj.get('step_index')} ({obj.get('type')}) ===\n".encode("utf-8"))
            for tc in obj.get("tool_calls", []):
                sys.stdout.buffer.write(f"  TC: {tc.get('name')} {tc.get('args')}\n".encode("utf-8"))
            c = obj.get("content", "")
            if c:
                sys.stdout.buffer.write(f"  Content ({len(c)}):\n{c[:300]}\n".encode("utf-8"))
