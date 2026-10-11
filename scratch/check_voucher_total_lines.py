import json

for sess_id in ["9c978313-6497-4767-b550-f862269faef2", "9091031b-b865-4df4-a8eb-694f9d8e6dea"]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "Total Lines:" in line:
                d = json.loads(line)
                content = d.get("content", "")
                for c_line in content.split("\n"):
                    if "Total Lines:" in c_line or "Showing lines" in c_line:
                        print(f"[{sess_id[:8]}] Step {d.get('step_index')}: {c_line}")
