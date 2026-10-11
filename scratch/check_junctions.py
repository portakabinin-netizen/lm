import os
import json

tf_c1868 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"
with open(tf_c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":432' in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            for l in c.splitlines():
                parts = l.split(":", 1)
                if len(parts) == 2 and parts[0].strip().isdigit():
                    num = int(parts[0].strip())
                    if 3015 <= num <= 3040:
                        print(f"432: {l}")
        if '"step_index":183' in line:
            obj = json.loads(line)
            args = obj["tool_calls"][0]["args"]
            print("183 TargetContent:")
            print(args.get("TargetContent"))
            print("183 StartLine/EndLine:", args.get("StartLine"), args.get("EndLine"))
            print("183 Rep line count:", len(args.get("ReplacementContent", "").splitlines()))
            print("183 Rep first 5 lines:")
            for rl in args.get("ReplacementContent", "").splitlines()[:5]:
                print("   ", rl)
            print("183 Rep last 5 lines:")
            for rl in args.get("ReplacementContent", "").splitlines()[-5:]:
                print("   ", rl)
