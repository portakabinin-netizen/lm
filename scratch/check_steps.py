import json

sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") in (105, 107):
            for tc in d.get("tool_calls", []):
                name = tc.get("name")
                args = tc.get("args", {})
                print(f"Step {d.get('step_index')}: {name} -> {args.get('TargetFile')}, content len={len(args.get('CodeContent', ''))}")
