import json, glob, os

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = [
    "c7e1b051-8b6d-4cde-950c-c303c5a89ff7",
    "a0b61b51-0899-4ad8-9363-cddafcf79685",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "7989469f-5ee3-4cd7-b2ee-28be1a1400be",
    "22cc85e5-a305-4455-b27d-47d0f4733a77",
    "9c978313-6497-4767-b550-f862269faef2",
    "9091031b-b865-4df4-a8eb-694f9d8e6dea",
]

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line and "view_file" in line:
                d = json.loads(line)
                for tc in d.get("tool_calls", []):
                    if tc.get("name") == "view_file":
                        args = tc.get("args", {})
                        if "VoucherEntryModal.tsx" in str(args.get("AbsolutePath", "")):
                            s = args.get("StartLine")
                            e = args.get("EndLine")
                            if (e and int(e) >= 1050) or (s and int(s) >= 1050):
                                print(f"[{sess_id[:8]}] Step {d.get('step_index')}: view_file {s} to {e}")
