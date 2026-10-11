import json, subprocess, os

# Let's extract the exact edits for VoucherEntryModal.tsx
sessions = [
    ("89d39ee6-698d-4d6a-8eae-5141dc08fca6", "Jul 11"),
    ("83d63010-919d-406b-8aa3-31dcaa2f3901", "Jul 31"),
    ("c7e1b051-8b6d-4cde-950c-c303c5a89ff7", "Aug 18"),
    ("a0b61b51-0899-4ad8-9363-cddafcf79685", "Aug 18"),
    ("36afcdb8-d594-4610-b09e-afe11607ccbc", "Aug 23"),
    ("2d6d4357-630e-4b41-a081-7e0700376b1f", "Aug 31"),
    ("7989469f-5ee3-4cd7-b2ee-28be1a1400be", "Aug 31"),
    ("9c978313-6497-4767-b550-f862269faef2", "Sep 03"),
]

all_edits = []
for sess_id, label in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line:
                d = json.loads(line)
                idx = d.get("step_index")
                for tc in d.get("tool_calls", []):
                    name = tc.get("name")
                    if name in ("replace_file_content", "multi_replace_file_content"):
                        args = tc.get("args", {})
                        tgt = str(args.get("TargetFile") or "")
                        if "VoucherEntryModal.tsx" in tgt:
                            all_edits.append((label, sess_id[:8], idx, name, args))

print(f"Total edit actions collected: {len(all_edits)}")
for label, sess, idx, name, args in all_edits:
    print(f"[{label}] {sess} Step {idx}: {name} - {args.get('Description', '')[:50]}")
