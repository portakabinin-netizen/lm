import json

for sess_id in ["112e2dc9-b569-4565-be91-4dbfb7f8d664", "bdb8ceb0-3985-4e07-abbd-ad9cd5e07252", "738bc5b5-3152-43db-bcad-387e398fd366"]:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    print(f"\n=== Session {sess_id} ===")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            d = json.loads(line)
            if d.get("type") == "USER_INPUT":
                print("USER_INPUT:", d.get("content", "")[:300])
            for tc in d.get("tool_calls", []):
                tgt = str(tc.get("args", {}).get("TargetFile") or tc.get("args", {}).get("AbsolutePath") or "")
                if "Voucher" in tgt or "Finance" in tgt:
                    print(f"Step {d.get('step_index')}: {tc.get('name')} -> {tgt}")
