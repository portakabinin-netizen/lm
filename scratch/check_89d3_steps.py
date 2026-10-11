import json

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(p, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (641, 681, 684, 857, 887, 897, 925):
            print(f"--- Step {idx} ({d.get('type')}) ---")
            for tc in d.get("tool_calls", []):
                print("Tool:", tc.get("name"))
                args = tc.get("args", {})
                print("Desc:", args.get("Description"))
                for chunk in args.get("ReplacementChunks", []):
                    print("StartLine:", chunk.get("StartLine"), "EndLine:", chunk.get("EndLine"))
                    print("ReplacementContent:\n", chunk.get("ReplacementContent")[:400])
                    print("...")
