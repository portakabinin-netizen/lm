import json

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl"
with open("c:/hipk/scratch/step485_499_out.txt", "w", encoding="utf-8") as out:
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            d = json.loads(line)
            idx = d.get("step_index")
            if idx in (485, 499):
                out.write(f"=== Step {idx} ===\n")
                for tc in d.get("tool_calls", []):
                    args = tc.get("args", {})
                    rc = args.get("ReplacementContent", "")
                    out.write(rc + "\n\n")
