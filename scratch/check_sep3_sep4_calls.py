import json

for sid in ["9c978313-6497-4767-b550-f862269faef2", "9091031b-b865-4df4-a8eb-694f9d8e6dea"]:
    p = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript_full.jsonl"
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "VoucherEntryModal.tsx" in line:
                d = json.loads(line)
                idx = d.get("step_index")
                tcs = d.get("tool_calls", [])
                for tc in tcs:
                    name = tc.get("name")
                    args = tc.get("args", {})
                    print(f"[{sid[:4]}] Step {idx}: {name} -> {args.get('Description', '')} | sl={args.get('StartLine')} el={args.get('EndLine')}")
