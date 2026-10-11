import os, json

sessions = [
    ("a5cf669f-863d-4d0f-9e38-d981d91feaab", "Jul 12"),
    ("83d63010-919d-406b-8aa3-31dcaa2f3901", "Jul 31"),
    ("c7e1b051-8b6d-4cde-950c-c303c5a89ff7", "Aug 18"),
    ("a0b61b51-0899-4ad8-9363-cddafcf79685", "Aug 18"),
    ("36afcdb8-d594-4610-b09e-afe11607ccbc", "Aug 23"),
    ("2d6d4357-630e-4b41-a081-7e0700376b1f", "Aug 31"),
    ("7989469f-5ee3-4cd7-b2ee-28be1a1400be", "Aug 31"),
    ("9c978313-6497-4767-b550-f862269faef2", "Sep 03"),
    ("9091031b-b865-4df4-a8eb-694f9d8e6dea", "Sep 04"),
]

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
all_edits = []

for sid, label in sessions:
    path = os.path.join(brain_dir, sid, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line:
                d = json.loads(line)
                idx = d.get("step_index")
                for tc in d.get("tool_calls", []):
                    if tc.get("name") in ("replace_file_content", "multi_replace_file_content"):
                        args = tc.get("args", {})
                        if "VoucherEntryModal.tsx" in str(args.get("TargetFile", "")):
                            all_edits.append((label, sid[:8], idx, tc.get("name"), args))

print(f"Total edits to VoucherEntryModal after Jul 12: {len(all_edits)}")
for label, sid, idx, name, args in all_edits:
    desc = args.get("Description", "")
    print(f"[{label}] {sid} Step {idx}: {name} -> {desc}")
