import subprocess

def run(cmd):
    res = subprocess.run(cmd, shell=True, capture_output=True, cwd=r"c:\hipk")
    return res.stdout.decode("utf-8", errors="ignore")

out = run('git log --all --since="2026-09-01" --until="2026-10-04" --oneline')
print("Commits between 2026-09-01 and 2026-10-04:")
print(out)
