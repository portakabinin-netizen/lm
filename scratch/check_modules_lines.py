import os
import subprocess

def run(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, cwd=r"c:\hipk")
    return res.stdout.decode("utf-8", errors="ignore")

files_to_check = [
    r"dashboards\ProjectDashboard.tsx",
    r"services\MissedShiftCheckerService.ts",
    r"modal\SitewiseAttendanceRegisterModal.tsx",
    r"modal\AttendanceModal.tsx",
    r"modal\ShiftChangeModal.tsx",
    r"UtilServices\BackgroundTasks.ts"
]

for f in files_to_check:
    fp = os.path.join(r"c:\hipk", f)
    if os.path.exists(fp):
        with open(fp, "r", encoding="utf-8", errors="ignore") as fp_in:
            lines = len(fp_in.readlines())
        print(f"{f:<45} | {lines} lines")
    else:
        print(f"{f:<45} | NOT FOUND")
