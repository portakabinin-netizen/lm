import json

for sess_id in ["f64bcf3c-0e80-4c4f-9c05-5475f6859eec", "36afcdb8-d594-4610-b09e-afe11607ccbc"]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "FinanceDashboard.tsx" in line and "Total Lines:" in line:
                d = json.loads(line)
                content = d.get("content", "")
                for c_line in content.split("\n"):
                    if "Total Lines:" in c_line:
                        print(f"[{sess_id[:8]}] Step {d.get('step_index')}: {c_line}")
                        break
