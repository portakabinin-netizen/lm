import os
import json
import re

history_dir = r"c:\hipk\history\frontend_snapshots"
os.makedirs(history_dir, exist_ok=True)

# 1. Save current AppHeader (v429)
with open(r"c:\hipk\components\AppHeader.tsx", "r", encoding="utf-8") as f:
    appheader_v429 = f.read()
with open(os.path.join(history_dir, "AppHeader_v429_sep21.tsx"), "w", encoding="utf-8") as f:
    f.write(appheader_v429)

# 2. Extract v691 from session a23079d7
f_a2 = r"C:\Users\herry\.gemini\antigravity-ide\brain\a23079d7-e2d0-4e09-8cae-4beb91691e13\.system_generated\logs\transcript_full.jsonl"
steps_a2 = [316, 302, 304, 306, 308, 310] # covers lines 1 to 691
lines_map = {}

with open(f_a2, "r", encoding="utf-8", errors="ignore") as fp:
    for line in fp:
        obj = json.loads(line)
        if obj.get("step_index") in steps_a2:
            content = obj.get("content", "")
            for l in content.splitlines():
                m = re.match(r'^\s*(\d+):\s?(.*)$', l)
                if m:
                    lines_map[int(m.group(1))] = m.group(2)

print(f"v691 lines parsed: {len(lines_map)} / 691")
if len(lines_map) >= 680:
    v691_code = "\n".join([lines_map.get(i, "") for i in range(1, max(lines_map.keys()) + 1)]) + "\n"
    with open(os.path.join(history_dir, "AppHeader_v691_sep18.tsx"), "w", encoding="utf-8") as f:
        f.write(v691_code)
    print("Saved AppHeader_v691_sep18.tsx")

# 3. Save v333 (July 4 version)
# We can get it from git commit 8efaee3
import subprocess
try:
    v333 = subprocess.check_output(["git", "show", "8efaee3:components/AppHeader.tsx"], cwd=r"c:\hipk", encoding="utf-8")
    with open(os.path.join(history_dir, "AppHeader_v333_jul04.tsx"), "w", encoding="utf-8") as f:
        f.write(v333)
    print("Saved AppHeader_v333_jul04.tsx")
except Exception as e:
    print(f"Error getting v333: {e}")

# 4. Save RoleBaseMenu snapshots
with open(r"c:\hipk\UtilServices\RoleBaseMenu.json", "r", encoding="utf-8") as f:
    rbm_7 = f.read()
with open(os.path.join(history_dir, "RoleBaseMenu_7roles.json"), "w", encoding="utf-8") as f:
    f.write(rbm_7)

if os.path.exists(r"c:\Users\herry\Dropbox\webHiBiz\rolebasemenu.json"):
    with open(r"c:\Users\herry\Dropbox\webHiBiz\rolebasemenu.json", "r", encoding="utf-8") as f:
        rbm_web = f.read()
    with open(os.path.join(history_dir, "RoleBaseMenu_webHiBiz.json"), "w", encoding="utf-8") as f:
        f.write(rbm_web)

# 5. Save _layout and BackgroundTasks
with open(r"c:\hipk\app\_layout.tsx", "r", encoding="utf-8") as f:
    layout_code = f.read()
with open(os.path.join(history_dir, "_layout_sep24.tsx"), "w", encoding="utf-8") as f:
    f.write(layout_code)

with open(r"c:\hipk\UtilServices\BackgroundTasks.ts", "r", encoding="utf-8") as f:
    bg_code = f.read()
with open(os.path.join(history_dir, "BackgroundTasks_sep30.ts"), "w", encoding="utf-8") as f:
    f.write(bg_code)

print("All history snapshots saved to:", history_dir)
