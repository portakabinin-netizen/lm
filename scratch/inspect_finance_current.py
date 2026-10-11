import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\hipk\dashboards\FinanceDashboard.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines in current FinanceDashboard.tsx: {len(lines)}")
# Check imports
for i in range(35):
    print(lines[i].rstrip())
