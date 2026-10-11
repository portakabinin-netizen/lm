import json, sys, re

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

lines_dict = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        content = obj.get('content', '')
        if 'File Path: `file:///c:/hipk/dashboards/FinanceDashboard.tsx`' in content:
            # Parse line numbered content
            for cl in content.split('\n'):
                m = re.match(r'^(\d+):\s?(.*)$', cl)
                if m:
                    line_no = int(m.group(1))
                    line_val = m.group(2)
                    # We only care about the chart range, say 650 to 1500
                    # Overwrite with later step to get the latest edits!
                    lines_dict[line_no] = line_val

print(f"Total lines captured: {len(lines_dict)}")
chart_lines = [k for k in lines_dict.keys() if 650 <= k <= 1470]
print(f"Chart lines captured: min {min(chart_lines) if chart_lines else None}, max {max(chart_lines) if chart_lines else None}, count {len(chart_lines)}")

# Check for any missing lines in the range
if chart_lines:
    min_l = min(chart_lines)
    max_l = max(chart_lines)
    missing = [i for i in range(min_l, max_l + 1) if i not in lines_dict]
    print(f"Missing lines between {min_l} and {max_l}: {missing}")
