import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 808:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                tgt = args.get("TargetContent", "").replace("\r\n", "\n")
                print("Step 808 tgt:\n", tgt[:300])
                print("Target line count:", len(tgt.splitlines()))
                break
