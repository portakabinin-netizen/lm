with open(r"c:\hipk\dashboards\ProjectDashboard.tsx", "r", encoding="utf-8", errors="ignore") as f:
    curr_lines = f.readlines()

print("Current lines:", len(curr_lines))
# Find line with PenaltyRegisterModal in curr_lines
p_start = None
for i, l in enumerate(curr_lines):
    if "PenaltyRegisterModal Component" in l:
        p_start = i
        break

print(f"PenaltyRegisterModal starts at {p_start+1} in current")
for l in curr_lines[p_start:p_start+15]:
    print(l, end="")
