import json

f_sep30 = r"C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl"

with open(f_sep30, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        step = obj.get("step_index")
        if step in [429, 435]:
            tc = obj.get("tool_calls", [])[0]
            print(f"=== Step {step} ===")
            print("Description:", tc.get("args", {}).get("Description"))
            tgt = tc.get("args", {}).get("TargetContent", "")
            rep = tc.get("args", {}).get("ReplacementContent", "")
            print("Target:", repr(tgt[:100]))
            print("Repl:", repr(rep[:100]))

# Check if target or repl is in current MissedShiftCheckerService.ts
with open(r"c:\hipk\services\MissedShiftCheckerService.ts", "r", encoding="utf-8", errors="ignore") as f:
    current_content = f.read()

print("Step 429 rep in current?", rep in current_content)
