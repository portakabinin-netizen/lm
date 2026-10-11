import json, sys

sys.stdout.reconfigure(encoding='utf-8')

with open('c:/hipk/scratch/step_659_rc.txt', 'r', encoding='utf-8') as f:
    chart = f.read()

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

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

curr = chart
success_count = 0
for s in chart_steps:
    if s not in step_map:
        print(f"Step {s} not found in transcript!")
        continue
    info = step_map[s]
    target = info['target']
    repl = info['repl']
    if target in curr:
        curr = curr.replace(target, repl)
        success_count += 1
        print(f"[{success_count}/{len(chart_steps)}] Step {s} applied: {info['desc'][:60]}")
    else:
        print(f"FAILED Step {s}: {info['desc'][:60]}")
        # print target snippet
        print("  Target start:", repr(target[:80]))
        # check if partial match
        for chunk_len in [40, 20]:
            if target[:chunk_len] in curr:
                print(f"  (First {chunk_len} chars matched in curr)")
                break

with open('c:/hipk/scratch/reconstructed_perfect_chart.tsx', 'w', encoding='utf-8') as out:
    out.write(curr)

print(f"\nFinished: {success_count}/{len(chart_steps)} steps applied. File len: {len(curr)}")
