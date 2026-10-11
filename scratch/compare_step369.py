import json, sys
sys.path.append('.')
from scratch.replay_all_voucher import current_text

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\c7e1b051-8b6d-4cde-950c-c303c5a89ff7\.system_generated\logs\transcript_full.jsonl"
with open(p, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 369:
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                tgt = args.get("TargetContent", "").replace("\r\n", "\n")
                
                # Check lines
                tgt_lines = tgt.splitlines()
                print(f"Target has {len(tgt_lines)} lines.")
                print(f"First 3 target lines: {tgt_lines[:3]}")
                print(f"Last 3 target lines: {tgt_lines[-3:]}")
                
                # find first line in current_text
                c_lines = current_text.splitlines()
                for i, l in enumerate(c_lines):
                    if tgt_lines[0].strip() and tgt_lines[0].strip() in l:
                        print(f"Match for first line at {i}: {repr(l)}")
                        print(f"Next 3 lines in current_text: {c_lines[i:i+4]}")
                        break
