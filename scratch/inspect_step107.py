import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 107:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                code = args.get("CodeContent", "")
                print(f"Step 107 CodeContent len={len(code)}, lines={len(code.splitlines())}")
                print("First 5 lines:")
                for l in code.splitlines()[:5]:
                    print("  ", l)
                print("Last 5 lines:")
                for l in code.splitlines()[-5:]:
                    print("  ", l)
