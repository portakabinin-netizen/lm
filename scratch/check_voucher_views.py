import json

def inspect_views_in_session(sess_id, target_file):
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    print(f"\n--- Checking views in {sess_id} for {target_file} ---")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if target_file in line:
                d = json.loads(line)
                # check if this is PLANNER_RESPONSE with view_file tool call
                for tc in d.get("tool_calls", []):
                    if tc.get("name") == "view_file":
                        args = tc.get("args", {})
                        if target_file in str(args.get("AbsolutePath", "")):
                            s = args.get("StartLine")
                            e = args.get("EndLine")
                            print(f"Step {d.get('step_index')}: view_file {s}-{e}")

inspect_views_in_session("36afcdb8-d594-4610-b09e-afe11607ccbc", "VoucherEntryModal.tsx")
inspect_views_in_session("9c978313-6497-4767-b550-f862269faef2", "VoucherEntryModal.tsx")
inspect_views_in_session("9091031b-b865-4df4-a8eb-694f9d8e6dea", "VoucherEntryModal.tsx")
