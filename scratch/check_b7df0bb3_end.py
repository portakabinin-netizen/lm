import json

b7df0bb3 = r"C:\Users\herry\.gemini\antigravity-ide\brain\b7df0bb3-74e3-4259-b188-e3eebba7a1c6\.system_generated\logs\transcript_full.jsonl"
with open(b7df0bb3, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"step_index":1386' in line or '"step_index":1388' in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            print(f"=== Step {obj.get('step_index')} ===")
            for l in c.splitlines()[:25]:
                print(l)
            print("...")
            for l in c.splitlines()[-10:]:
                print(l)
