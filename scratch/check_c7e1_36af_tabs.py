import json

sessions = [
    ("c7e1b051-8b6d-4cde-950c-c303c5a89ff7", [361, 369, 373, 407, 411, 421, 439]),
    ("36afcdb8-d594-4610-b09e-afe11607ccbc", [481, 485, 491, 499, 503, 507, 824]),
]

for sess_id, steps in sessions:
    p = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            d = json.loads(line)
            idx = d.get("step_index")
            if idx in steps:
                print(f"=== {sess_id[:8]} Step {idx} ===")
                for tc in d.get("tool_calls", []):
                    args = tc.get("args", {})
                    print("Desc:", args.get("Description"))
                    rc = args.get("ReplacementContent", "")
                    if rc:
                        print(rc[:400])
                    for chunk in args.get("ReplacementChunks", []):
                        print("Chunk:", chunk.get("ReplacementContent")[:400])
