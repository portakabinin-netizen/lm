import json, os, re

def get_session_path(sid):
    p = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript_full.jsonl"
    if os.path.exists(p): return p
    return rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sid}\.system_generated\logs\transcript.jsonl"

# 1. Base from a0b61b51 step 107
p_a0 = get_session_path("a0b61b51-0899-4ad8-9363-cddafcf79685")
base_text = ""
with open(p_a0, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        d = json.loads(line)
        if d.get("step_index") == 107:
            for tc in d.get("tool_calls", []):
                base_text = tc.get("args", {}).get("CodeContent", "").replace("\r\n", "\n")
                break

print(f"Step 107 base lines: {len(base_text.splitlines())}")

# Let's see what happens if we find view_file slices in f64bcf3c
# In f64bcf3c, what was the entire FinancialComparisonLineChart?
p_f6 = get_session_path("f64bcf3c-0e80-4c4f-9c05-5475f6859eec")
views_f6 = {}
with open(p_f6, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "FinanceDashboard.tsx" in line and "VIEW_FILE" in line:
            d = json.loads(line)
            c = d.get("content", "")
            for l in c.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    views_f6[int(m.group(1))] = m.group(2)

print(f"Total views in f64bcf3c: {len(views_f6)}")
