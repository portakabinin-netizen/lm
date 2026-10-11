# Let's verify lines 2880-2950 and 3300-3380
import json

c1868 = r"C:\Users\herry\.gemini\antigravity-ide\brain\c1868f3b-9dde-4eb0-b055-98666af278ca\.system_generated\logs\transcript_full.jsonl"

with open(c1868, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if '"type":"VIEW_FILE"' in line and "ProjectDashboard.tsx" in line:
            obj = json.loads(line)
            c = obj.get("content", "")
            if "Showing lines 2835 to 2870" in c:
                print("Step", obj.get("step_index"), "lines 2835 to 2870:")
                for l in c.splitlines()[-10:]:
                    print("  ", l)
            elif "Showing lines 2950 to 3020" in c:
                print("Step", obj.get("step_index"), "lines 2950 to 3020:")
                for l in c.splitlines()[:15]:
                    print("  ", l)
