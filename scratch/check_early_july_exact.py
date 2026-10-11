import json

for sess_id, label in [("3ed957af-d865-4b44-86f8-676f2a2e179a", "Jul 5"), ("110b85a9-9b11-48d8-a757-25b9e2b4ed69", "Jul 9")]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line:
                d = json.loads(line)
                for tc in d.get("tool_calls", []):
                    if tc.get("name") in ("replace_file_content", "multi_replace_file_content"):
                        args = tc.get("args", {})
                        tgt = str(args.get("TargetFile") or "")
                        if "VoucherEntryModal.tsx" in tgt:
                            print(f"[{label}] Step {d.get('step_index')}: {tc.get('name')} - {args.get('Description')}")
