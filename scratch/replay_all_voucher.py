import json, os, re

# 1. Build exact July 12 base
p_a5 = r"C:\Users\herry\.gemini\antigravity-ide\brain\a5cf669f-863d-4d0f-9e38-d981d91feaab\.system_generated\logs\transcript_full.jsonl"
p_89 = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"

lines_base = {}

# Lines 1 to 800 from a5cf669f step 15
with open(p_a5, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 15:
            for l in d.get("content", "").splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_base[int(m.group(1))] = m.group(2)

# Lines 801 to 1213 from 89d39ee6 step 639 and 872
with open(p_89, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") in (639, 872):
            for l in d.get("content", "").splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_base[int(m.group(1))] = m.group(2)

# Fill lines 1168 and 1169 from Chunk 4
lines_base[1168] = '                {(user?.accessCorporate || []).map((corp: any) => {'
lines_base[1169] = '                  const isActive = corp.dbName === user?.dbName;'

base_text = "\n".join(lines_base[i] for i in range(1, max(lines_base.keys()) + 1))
print(f"Base text reconstructed: {len(base_text.splitlines())} lines.")

with open("c:/hipk/scratch/voucher_base_jul12.tsx", "w", encoding="utf-8") as f:
    f.write(base_text)

# Now let's test replaying the 26 edits from July 12 onwards!
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

current_text = base_text
success = 0
for label, sid, idx, name, args in all_edits:
    desc = args.get("Description", "")[:50]
    if name == "replace_file_content":
        tgt = args.get("TargetContent", "").replace("\r\n", "\n")
        rep = args.get("ReplacementContent", "").replace("\r\n", "\n")
        if tgt in current_text:
            current_text = current_text.replace(tgt, rep, 1)
            print(f"[OK] [{label}] Step {idx}: replace - {desc}")
            success += 1
        else:
            print(f"[ERR] [{label}] Step {idx}: replace - {desc}")
            print("  Target preview:\n", repr(tgt[:120]))
            break
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks", [])
        temp_text = current_text
        failed = False
        for c_idx, ch in enumerate(chunks):
            tgt = ch.get("TargetContent", "").replace("\r\n", "\n")
            rep = ch.get("ReplacementContent", "").replace("\r\n", "\n")
            if tgt in temp_text:
                temp_text = temp_text.replace(tgt, rep, 1)
            else:
                print(f"[ERR-CHUNK] [{label}] Step {idx} chunk {c_idx}")
                print("  Target preview:\n", repr(tgt[:120]))
                failed = True
                break
        if not failed:
            current_text = temp_text
            print(f"[OK] [{label}] Step {idx}: multi_replace ({len(chunks)} chunks) - {desc}")
            success += 1
        else:
            break

print(f"\nReplay result: {success}/{len(all_edits)} succeeded. Total lines: {len(current_text.splitlines())}")
if success == len(all_edits):
    with open("c:/hipk/scratch/VoucherEntryModal_replayed_final.tsx", "w", encoding="utf-8") as f:
        f.write(current_text)
    print("Saved c:/hipk/scratch/VoucherEntryModal_replayed_final.tsx successfully!")
