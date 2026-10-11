with open(r"c:\hipk\dashboards\ProjectDashboard.tsx", "r", encoding="utf-8", errors="ignore") as f:
    curr_lines = f.readlines()

staff_start = None
for i, l in enumerate(curr_lines):
    if "StaffListModal Component" in l:
        staff_start = i
        break

print(f"StaffListModal starts at {staff_start+1} in current")
for l in curr_lines[staff_start:staff_start+184]:
    print(l, end="")
