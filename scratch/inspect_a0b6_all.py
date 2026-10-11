import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        for tc in d.get("tool_calls", []):
            name = tc.get("name")
            args = tc.get("args", {})
            tgt = str(args.get("TargetFile") or args.get("AbsolutePath") or "")
            if "FinanceDashboard.tsx" in tgt:
                if name in ("replace_file_content", "multi_replace_file_content", "write_to_file"):
                    print(f"Step {idx}: {name} - {args.get('Description', '')[:50]}")
                elif name == "view_file":
                    s, e = args.get("StartLine"), args.get("EndLine")
                    if e and int(e) > 3000:
                        print(f"Step {idx}: view_file {s} to {e}")
