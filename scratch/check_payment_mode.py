import subprocess, json

text = subprocess.check_output(["git", "show", "HEAD:modal/VoucherEntryModal.tsx"], encoding="utf-8")
text = text.replace("\r\n", "\n")

# Run up to step 925
sess = r"C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl"
with open(sess, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "VoucherEntryModal.tsx" in line:
            d = json.loads(line)
            for tc in d.get("tool_calls", []):
                if tc.get("name") == "multi_replace_file_content":
                    for ch in tc.get("args", {}).get("ReplacementChunks", []):
                        tgt = ch.get("TargetContent", "").replace("\r\n", "\n")
                        rep = ch.get("ReplacementContent", "").replace("\r\n", "\n")
                        text = text.replace(tgt, rep)

lines = text.splitlines()
for i, l in enumerate(lines):
    if "mode === 'payment'" in l:
        for j in range(max(0, i-2), min(len(lines), i+15)):
            print(f"{j+1}: {repr(lines[j])}")
        break
