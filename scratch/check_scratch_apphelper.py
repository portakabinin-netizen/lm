import glob
import re

files = glob.glob(r"c:\hipk\scratch\view_apphelper_*.txt")
for f in sorted(files):
    with open(f, "r", encoding="utf-8", errors="ignore") as fp:
        lines = [l for l in fp.read().splitlines() if l.strip()]
        nums = []
        for l in lines:
            m = re.match(r'^\s*(\d+):', l)
            if m:
                nums.append(int(m.group(1)))
        if nums:
            print(f"{f}: lines {min(nums)} to {max(nums)} ({len(nums)} lines)")
        else:
            print(f"{f}: no line numbers, {len(lines)} raw lines. First line: {lines[0] if lines else ''}")
