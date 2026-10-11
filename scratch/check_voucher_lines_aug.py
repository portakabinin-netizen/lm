import json

for sess_id in ["36afcdb8-d594-4610-b09e-afe11607ccbc", "7989469f-5ee3-4cd7-b2ee-28be1a1400be"]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "Total Lines:" in line:
                d = json.loads(line)
                content = d.get("content", "")
                for c_line in content.split("\n"):
                    if "Total Lines:" in c_line or "Showing lines" in c_line:
                        print(f"[{sess_id[:8]}] Step {d.get('step_index')}: {c_line}")
                        break
