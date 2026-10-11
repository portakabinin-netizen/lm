import os, json

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = []

# List all sessions after Sep 04
for s in os.listdir(brain_dir):
    p = os.path.join(brain_dir, s, ".system_generated", "logs", "transcript.jsonl")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                d = json.loads(line)
                created = d.get("created_at", "")
                if created >= "2026-09-04":
                    sessions.append((created, s))
                break

sessions.sort(key=lambda x: x[0])
print(f"Total sessions after Sep 04: {len(sessions)}")

voucher_touches = []
finance_touches = []

for created, s in sessions:
    pf = os.path.join(brain_dir, s, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(pf):
        pf = os.path.join(brain_dir, s, ".system_generated", "logs", "transcript.jsonl")
    if not os.path.exists(pf):
        continue
    try:
        with open(pf, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "VoucherEntryModal.tsx" in line:
                    d = json.loads(line)
                    for tc in d.get("tool_calls", []):
                        voucher_touches.append((created, s[:8], d.get("step_index"), tc.get("name"), tc.get("args", {}).get("Description", "")))
                if "FinanceDashboard.tsx" in line:
                    d = json.loads(line)
                    for tc in d.get("tool_calls", []):
                        finance_touches.append((created, s[:8], d.get("step_index"), tc.get("name"), tc.get("args", {}).get("Description", "")))
    except Exception as e:
        pass

print(f"\nVoucherEntryModal touches after Sep 04: {len(voucher_touches)}")
for t in voucher_touches:
    print(t)

print(f"\nFinanceDashboard touches after Sep 04: {len(finance_touches)}")
for t in finance_touches:
    print(t)
