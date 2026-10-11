import json, sys
sys.stdout.reconfigure(encoding='utf-8')
p = r'C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl'
with open(p, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if 'pettyCashSummary' in line:
            obj = json.loads(line)
            idx = obj.get('step_index')
            for tc in obj.get('tool_calls', []):
                args = tc.get('args', {})
                for k in ['ReplacementContent', 'CodeContent']:
                    val = args.get(k, '')
                    for i, l in enumerate(val.splitlines()):
                        if 'pettyCashSummary' in l:
                            print(f'Step {idx} [{k}] Line {i}: {l}')
