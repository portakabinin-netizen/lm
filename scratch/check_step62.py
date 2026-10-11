import json
import sys

f_sep30 = r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl"

with open(f_sep30, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 62:
            for tc in obj.get("tool_calls", []):
                sys.stdout.buffer.write(f"TC: {tc.get('name')}\n".encode("utf-8"))
                args = tc.get("args", {})
                for k, v in args.items():
                    if k != "CodeContent" and k != "ReplacementContent":
                        sys.stdout.buffer.write(f"  {k}: {v}\n".encode("utf-8"))
                    else:
                        sys.stdout.buffer.write(f"  {k} (length {len(v)}):\n{v[:200]}...\n".encode("utf-8"))
