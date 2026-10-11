import os, json, re

brain_dir = r"C:\Users\herry\.gemini\antigravity-ide\brain"
sessions = os.listdir(brain_dir)

all_views_after_1100 = {}

for sess in sessions:
    path = os.path.join(brain_dir, sess, ".system_generated", "logs", "transcript_full.jsonl")
    if not os.path.exists(path):
        continue
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "VoucherEntryModal.tsx" in line and "VIEW_FILE" in line:
                    d = json.loads(line)
                    c = d.get("content", "")
                    for l in c.splitlines():
                        m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                        if m:
                            num = int(m.group(1))
                            if num >= 1100:
                                if num not in all_views_after_1100:
                                    all_views_after_1100[num] = (sess, m.group(2))
    except Exception as e:
        pass

lines = sorted(all_views_after_1100.keys())
print(f"Total lines >= 1100 found: {len(lines)}")
if lines:
    print(f"Min: {lines[0]}, Max: {lines[-1]}")
    for i in range(lines[0], min(lines[-1]+1, lines[0]+30)):
        if i in all_views_after_1100:
            print(f"{i} [{all_views_after_1100[i][0][:8]}]: {all_views_after_1100[i][1]}")
    print("...")
    for i in range(max(lines[0], lines[-1]-15), lines[-1]+1):
        if i in all_views_after_1100:
            print(f"{i} [{all_views_after_1100[i][0][:8]}]: {all_views_after_1100[i][1]}")
