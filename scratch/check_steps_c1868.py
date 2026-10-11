import json

c1868f3b = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

steps = [155, 175, 179, 183, 211, 264]

with open(c1868f3b, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        step = obj.get("step_index")
        if step in steps and obj.get("type") == "PLANNER_RESPONSE":
            print(f"=== Step {step} ===")
            for tc in obj.get("tool_calls", []):
                args = tc.get("args", {})
                desc = args.get("Description") or args.get("Instruction")
                print("Desc:", desc)
                if "ReplacementChunks" in args:
                    for ch in args["ReplacementChunks"]:
                        print(f"  Chunk {ch.get('StartLine')}-{ch.get('EndLine')}: target lines={len(ch.get('TargetContent','').splitlines())}, repl lines={len(ch.get('ReplacementContent','').splitlines())}")
                elif "ReplacementContent" in args:
                    print(f"  Single repl {args.get('StartLine')}-{args.get('EndLine')}: target lines={len(args.get('TargetContent','').splitlines())}, repl lines={len(args.get('ReplacementContent','').splitlines())}")
