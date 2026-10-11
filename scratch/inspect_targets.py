import json

def inspect_session_file(sess_id, target_file):
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    print(f"Checking {sess_id} for {target_file}...")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if target_file in line:
                d = json.loads(line)
                for tc in d.get("tool_calls", []):
                    name = tc.get("name")
                    args = tc.get("args", {})
                    tgt = str(args.get("TargetFile") or args.get("AbsolutePath") or "")
                    if target_file in tgt:
                        step = d.get("step_index")
                        if name == "replace_file_content":
                            s = args.get("StartLine")
                            e = args.get("EndLine")
                            desc = args.get("Description", "")
                            print(f"Step {step}: replace {s}-{e} | {desc[:60]}")
                        elif name == "view_file":
                            s = args.get("StartLine")
                            e = args.get("EndLine")
                            print(f"Step {step}: view {s}-{e}")
                        elif name == "write_to_file":
                            print(f"Step {step}: write_to_file len={len(args.get('CodeContent',''))}")
                        else:
                            print(f"Step {step}: {name}")

if __name__ == "__main__":
    inspect_session_file("f64bcf3c-0e80-4c4f-9c05-5475f6859eec", "FinanceDashboard.tsx")
