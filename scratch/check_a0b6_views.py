import json

path = r"C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if idx in (775, 781, 785, 789, 791):
            print(f"=== Step {idx} ===")
            content = d.get("content", "")
            for l in content.splitlines()[:25]:
                print(l.encode("ascii", "replace").decode("ascii"))
