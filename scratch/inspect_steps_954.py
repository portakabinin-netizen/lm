import json

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\9979a84a-578a-4ae6-a2aa-6c88ca067103\.system_generated\logs\transcript_full.jsonl"
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index", 0)
        if idx >= 954:
            stype = d.get("type")
            tcs = d.get("tool_calls", [])
            if tcs:
                for tc in tcs:
                    name = tc.get("name")
                    args = tc.get("args", {})
                    desc = args.get("Description", "") or args.get("CommandLine", "") or args.get("TargetFile", "")
                    print(f"Step {idx} [{stype}]: {name} -> {str(desc)[:100]}")
            elif stype == "PLANNER_RESPONSE" and "pause" in d.get("content", "").lower():
                print(f"Step {idx} [PAUSE/FINAL]: {d.get('content')[:200]}")
