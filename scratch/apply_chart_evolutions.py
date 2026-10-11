import json, sys

sys.stdout.reconfigure(encoding='utf-8')

with open('c:/hipk/scratch/step_659_rc.txt', 'r', encoding='utf-8') as f:
    chart = f.read()

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

step_diffs = {}
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in [257, 393, 442, 448, 462, 630, 821, 917]:
            tcs = obj.get('tool_calls', [])
            for tc in tcs:
                params = tc.get('args') or tc.get('parameters', {})
                step_diffs[idx] = {
                    'desc': params.get('Description', ''),
                    'target': params.get('TargetContent', ''),
                    'replacement': params.get('ReplacementContent', '')
                }

curr = chart
for idx in sorted(step_diffs.keys()):
    info = step_diffs[idx]
    target = info['target']
    repl = info['replacement']
    if target in curr:
        curr = curr.replace(target, repl)
        print(f"Step {idx} applied successfully! New length: {len(curr)}")
    else:
        print(f"Step {idx} FAILED to match target!")

with open('c:/hipk/scratch/evolved_chart.tsx', 'w', encoding='utf-8') as out:
    out.write(curr)

print("Saved evolved_chart.tsx!")
