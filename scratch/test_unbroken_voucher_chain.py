import json, os, subprocess

base_text = subprocess.check_output(["git", "show", "HEAD:modal/VoucherEntryModal.tsx"], encoding="utf-8")
text = base_text.replace("\r\n", "\n")

sessions = [
    ("3ed957af-d865-4b44-86f8-676f2a2e179a", "Jul 05"),
    ("110b85a9-9b11-48d8-a757-25b9e2b4ed69", "Jul 09"),
    ("89d39ee6-698d-4d6a-8eae-5141dc08fca6", "Jul 11"),
    ("a5cf669f-863d-4d0f-9e38-d981d91feaab", "Jul 12"),
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
        print(f"Path does not exist: {path}")
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

print(f"Total edits collected: {len(all_edits)}")

success_count = 0
for label, sess, idx, name, args in all_edits:
    desc = args.get("Description", "")[:50]
    if name == "replace_file_content":
        tgt = args.get("TargetContent", "").replace("\r\n", "\n")
        rep = args.get("ReplacementContent", "").replace("\r\n", "\n")
        if tgt in text:
            text = text.replace(tgt, rep)
            print(f"[OK] [{label}] Step {idx}: replace - {desc}")
            success_count += 1
        else:
            print(f"[ERR-NOTFOUND] [{label}] Step {idx}: replace - {desc}")
            print(f"  Target preview:\n{tgt[:150]}")
            break
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks", [])
        chunk_failed = False
        temp_text = text
        for c_idx, ch in enumerate(chunks):
            tgt = ch.get("TargetContent", "").replace("\r\n", "\n")
            rep = ch.get("ReplacementContent", "").replace("\r\n", "\n")
            if tgt in temp_text:
                temp_text = temp_text.replace(tgt, rep)
            else:
                print(f"[ERR-CHUNK-NOTFOUND] [{label}] Step {idx} chunk {c_idx}")
                print(f"  Target preview:\n{tgt[:150]}")
                chunk_failed = True
                break
        if not chunk_failed:
            text = temp_text
            print(f"[OK] [{label}] Step {idx}: multi_replace ({len(chunks)} chunks) - {desc}")
            success_count += 1
        else:
            break

print(f"\nCompleted {success_count} / {len(all_edits)} edits.")
print(f"Final text line count: {len(text.splitlines())}")

if success_count == len(all_edits):
    with open("c:/hipk/scratch/VoucherEntryModal_restored.tsx", "w", encoding="utf-8") as f:
        f.write(text)
    print("Saved c:/hipk/scratch/VoucherEntryModal_restored.tsx successfully!")
