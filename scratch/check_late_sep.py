import json, os

sessions = [
    ("964617eb-49c1-45b7-ae8e-54b619636bc4", "Sep 16"),
    ("b7df0bb3-74e3-4259-b188-e3eebba7a1c6", "Sep 17"),
    ("c1868f3b-9dde-4eb0-b055-98666af278ca", "Sep 17"),
    ("51de807f-d55d-4095-bf41-e5d0ad1fece9", "Sep 24"),
    ("924d6424-27a0-4913-9bdf-a2ce3aee4056", "Sep 25"),
    ("153e79b4-00e0-41c6-ba97-4b8b7083ff82", "Sep 30"),
    ("d1c1d7a2-7554-4771-84a0-505e7b03dede", "Oct 01"),
]

for sess_id, label in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line or "FinanceDashboard.tsx" in line:
                d = json.loads(line)
                for tc in d.get("tool_calls", []):
                    args = tc.get("args", {})
                    tgt = str(args.get("TargetFile") or args.get("AbsolutePath") or "")
                    if "VoucherEntryModal.tsx" in tgt or "FinanceDashboard.tsx" in tgt:
                        print(f"[{label} - {sess_id[:8]}] Step {d.get('step_index')}: {tc.get('name')} -> {tgt}")
