import json

c1868f3b = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

with open(c1868f3b, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        obj = json.loads(line)
        if obj.get("step_index") == 183:
            tc = obj.get("tool_calls", [])[0]
            rep = tc["args"]["ReplacementContent"]
            print("Step 183 ReplacementContent lines:", len(rep.splitlines()))
            for l in rep.splitlines()[:50]:
                print(l)
            print("...")
            for l in rep.splitlines()[-40:]:
                print(l)
