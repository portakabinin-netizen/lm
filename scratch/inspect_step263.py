import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 263:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                rep = args.get("ReplacementContent", "")
                tgt = args.get("TargetContent", "")
                print(f"Step 263 Target lines={len(tgt.splitlines())}, Rep lines={len(rep.splitlines())}")
                print(f"StartLine={args.get('StartLine')}, EndLine={args.get('EndLine')}")
