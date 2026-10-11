import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if 763 <= idx <= 782:
            print(f"Step {idx}: {d.get('type')}")
            for tc in d.get("tool_calls", []):
                target = tc.get('args', {}).get('TargetFile') or tc.get('args', {}).get('CommandLine') or tc.get('args', {}).get('AbsolutePath') or ''
                print(f"  tc: {tc.get('name')} | {target}")
