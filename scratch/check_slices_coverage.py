import json, os

sessions = [
    "f64bcf3c-0e80-4c4f-9c05-5475f6859eec",
    "36afcdb8-d594-4610-b09e-afe11607ccbc",
    "a0b61b51-0899-4ad8-9363-cddafcf79685",
]

all_slices = []

for sess_id in sessions:
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{sess_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "FinanceDashboard.tsx" in line and "Total Lines:" in line:
                d = json.loads(line)
                content = d.get("content", "")
                s_line, e_line = None, None
                for l in content.splitlines():
                    if "Showing lines" in l:
                        parts = l.split()
                        try:
                            s_line = int(parts[2])
                            e_line = int(parts[4])
                        except:
                            pass
                if s_line is not None and e_line is not None:
                    # extract line numbers and content
                    slice_lines = {}
                    for l in content.splitlines():
                        if ": " in l:
                            p = l.split(": ", 1)
                            if p[0].strip().isdigit():
                                l_num = int(p[0].strip())
                                slice_lines[l_num] = p[1]
                    all_slices.append((sess_id[:8], d.get("step_index"), s_line, e_line, len(slice_lines)))

print(f"Total slices captured: {len(all_slices)}")
all_slices.sort(key=lambda x: x[2])
for s in all_slices:
    print(f"Sess: {s[0]} | Step: {s[1]} | Lines {s[2]} to {s[3]} | extracted {s[4]} lines")
