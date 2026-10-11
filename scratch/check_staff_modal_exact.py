import os
import json

tf = r"C:\Users\herry\.gemini\antigravity-ide\brain\964617eb-49c1-45b7-ae8e-54b619636bc4\.system_generated\logs\transcript_full.jsonl"
step664_lines = {}
step666_lines = {}
with open(tf, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            if obj.get("step_index") == 664:
                for l in obj.get("content", "").splitlines():
                    parts = l.split(":", 1)
                    if len(parts) == 2 and parts[0].strip().isdigit():
                        step664_lines[int(parts[0].strip())] = parts[1].lstrip(" ")
            if obj.get("step_index") == 666:
                for l in obj.get("content", "").splitlines():
                    parts = l.split(":", 1)
                    if len(parts) == 2 and parts[0].strip().isdigit():
                        step666_lines[int(parts[0].strip())] = parts[1].lstrip(" ")

print("664 min/max:", min(step664_lines.keys()), max(step664_lines.keys()))
print("666 min/max:", min(step666_lines.keys()), max(step666_lines.keys()))

# Step 236 from 924d
tf_924d = r"C:\Users\herry\.gemini\antigravity-ide\brain\924d6424-27a0-4913-9bdf-a2ce3aee4056\.system_generated\logs\transcript_full.jsonl"
step236_lines = {}
with open(tf_924d, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            if obj.get("step_index") == 236:
                for l in obj.get("content", "").splitlines():
                    parts = l.split(":", 1)
                    if len(parts) == 2 and parts[0].strip().isdigit():
                        step236_lines[int(parts[0].strip())] = parts[1].lstrip(" ")

print("236 min/max:", min(step236_lines.keys()), max(step236_lines.keys()))
print("Lines 945-958 of step 236:")
for i in range(945, 959):
    print(f"{i}: {step236_lines.get(i)}")
