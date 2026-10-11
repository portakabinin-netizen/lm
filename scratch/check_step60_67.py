import json
import sys

f_sep30 = r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl"

with open(f_sep30, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") in range(60, 68):
            sys.stdout.buffer.write(f"=== Step {obj.get('step_index')} ({obj.get('type')}) ===\n".encode("utf-8"))
            for tc in obj.get("tool_calls", []):
                sys.stdout.buffer.write(f"  TC: {tc.get('name')} {tc.get('args')}\n".encode("utf-8"))
            c = obj.get("content", "")
            if c:
                sys.stdout.buffer.write(f"  Content ({len(c)}):\n{c[:300]}\n".encode("utf-8"))
