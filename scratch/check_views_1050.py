import json

sessions = [
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "a0b61b51-0899-4ad8-9363-cddafcf79685",
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
    "83d63010-919d-406b-8aa3-31dcaa2f3901",
    "89d39ee6-698d-4d6a-8eae-5141dc08fca6",
]

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "view_file" in line:
                d = json.loads(line)
                for tc in d.get("tool_calls", []):
                    args = tc.get("args", {})
                    if "VoucherEntryModal.tsx" in str(args.get("AbsolutePath", "")):
                        s = args.get("StartLine")
                        e = args.get("EndLine")
                        if s and int(s) >= 1050:
                            print(f"[{sess_id[:8]}] Step {d.get('step_index')}: view_file {s}-{e}")
