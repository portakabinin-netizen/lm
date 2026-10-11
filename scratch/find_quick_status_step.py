import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "QUICK STATUS ACTIONS" in line:
            obj = json.loads(line)
            print(f"Step {obj.get('step_index')}, type: {obj.get('type')}")
            if obj.get("type") == "VIEW_FILE":
                c = obj.get("content", "")
                for l in c.splitlines():
                    if any(w in l for w in ["QUICK STATUS", "dayActionModal", "startEdit", "markQuick"]):
                        print("  ", l)
            elif "tool_calls" in obj:
                args = obj["tool_calls"][0]["args"]
                print("Tool call args keys:", list(args.keys()))
