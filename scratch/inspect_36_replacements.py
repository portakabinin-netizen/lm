import json, os

def get_transcript(sid):
    p = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript_full.jsonl"
    if os.path.exists(p): return p
    return rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript.jsonl"

# Check Step 481 in 36afcdb8 for Gap 261-299
p_36 = get_transcript("36afcdb8-d594-4610-b09e-afe11607ccbc")
with open(p_36, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") in (481, 485, 491, 499, 503, 507, 824):
            for tc in d.get("tool_calls", []):
                args = tc.get("args", {})
                print(f"36afcdb8 Step {d.get('step_index')}: {args.get('Description')}")
                rep = args.get("ReplacementContent", "")
                print(f"  Lines: {len(rep.splitlines())}")
