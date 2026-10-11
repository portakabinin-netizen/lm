import os
import json

tf_924d = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"
with open(tf_924d, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":253' in line:
            obj = json.loads(line)
            args = obj["tool_calls"][0]["args"]
            print("TC 253 chunks count:", len(args["ReplacementChunks"]))
            for i, ch in enumerate(args["ReplacementChunks"]):
                print(f"Chunk {i}: lines {ch.get('StartLine')} - {ch.get('EndLine')}")
                print(f"  Target line count: {len(ch['TargetContent'].splitlines())}")
                print(f"  Rep line count: {len(ch['ReplacementContent'].splitlines())}")
