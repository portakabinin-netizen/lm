import json, sys, re

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

initial_lines = {}
# Steps before any replacements were made: 123, 125, 127, 129, 155, 187, 198
early_steps = [123, 125, 127, 129, 155, 187, 198]

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in early_steps:
            content = obj.get('content', '')
            for cl in content.split('\n'):
                m = re.match(r'^(\d+):\s?(.*)$', cl)
                if m:
                    initial_lines[int(m.group(1))] = m.group(2)

print(f"Captured initial lines: {len(initial_lines)}")
chart_range = [k for k in initial_lines.keys() if 650 <= k <= 1320]
print(f"Range: min {min(chart_range) if chart_range else None}, max {max(chart_range) if chart_range else None}")
missing = [i for i in range(min(chart_range), max(chart_range)+1) if i not in initial_lines]
print(f"Missing lines: {missing}")

# Assemble initial chart string
initial_chart = '\n'.join([initial_lines[i] for i in range(min(chart_range), max(chart_range)+1)])
print(f"Initial chart length: {len(initial_chart)} chars, {initial_chart.count(chr(10))} lines")

# Now let's test applying all 24 replacements from f64bcf3c
chart_steps = [
    393, 399, 432, 442, 448, 462, 548, 626, 630, 
    665, 695, 699, 737, 741, 779, 809, 813, 821, 
    860, 864, 900, 906, 910, 916
]

step_map = {}
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in chart_steps:
            tcs = obj.get('tool_calls', [])
            for tc in tcs:
                if tc.get('name') == 'replace_file_content' or tc.get('function', {}).get('name') == 'replace_file_content':
                    params = tc.get('args') or tc.get('parameters', {})
                    step_map[idx] = {
                        'desc': params.get('Description', '') or params.get('Instruction', ''),
                        'target': params.get('TargetContent', ''),
                        'repl': params.get('ReplacementContent', '')
                    }

curr = initial_chart
success = 0
for s in chart_steps:
    if s not in step_map:
        continue
    info = step_map[s]
    target = info['target']
    repl = info['repl']
    if target in curr:
        curr = curr.replace(target, repl)
        success += 1
        print(f"[{success}/{len(chart_steps)}] Step {s} SUCCESS: {info['desc'][:60]}")
    else:
        print(f"Step {s} FAILED: {info['desc'][:60]}")
        # check why
        if target.strip() in curr:
            print("  (target.strip() was in curr!)")
        else:
            print("  Target start:", repr(target[:60]))

with open('c:/hipk/scratch/final_evolved_chart.tsx', 'w', encoding='utf-8') as out:
    out.write(curr)

print(f"\nResult: {success}/{len(chart_steps)} steps succeeded. Final length: {len(curr)}")
