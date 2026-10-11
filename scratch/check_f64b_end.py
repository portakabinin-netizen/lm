import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (916, 917, 918, 919, 920):
            print(f"Step {idx} ({d.get('type')}):")
            if d.get("tool_calls"):
                for tc in d.get("tool_calls"):
                    print("  Tool call:", tc.get("name"), tc.get("args", {}).get("Description"))
            if d.get("content"):
                print("  Content preview:", d.get("content")[:200])
