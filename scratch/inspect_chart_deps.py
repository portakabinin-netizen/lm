import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\hipk\scratch\FinancialComparisonLineChart_complete.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

print("File size:", len(content), "lines:", content.count('\n'))
# Check for any undefined references or imports at top
lines = content.split('\n')
for i in range(40):
    print(lines[i])
