import json

p = r"C:\Users\herry\.gemini\antigravity-ide\brain\c7e1b051-8b6d-4cde-950c-c303c5a89ff7\.system_generated\logs\transcript_full.jsonl"
with open(p, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        idx = d.get("step_index")
        if d.get("type") == "VIEW_FILE" and "VoucherEntryModal.tsx" in line:
            c = d.get("content", "")
            first_l = ""
            for l in c.splitlines():
                if "Showing lines" in l:
                    first_l = l
                    break
            print(f"Step {idx}: {first_l}")
