import json, sys
sys.stdout.reconfigure(encoding='utf-8')
p = r'C:\Users\herry\.gemini\antigravity-ide\brain\a0b61b51-0899-4ad8-9363-cddafcf79685\.system_generated\logs\transcript_full.jsonl'
with open(p, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        obj = json.loads(line)
        if obj.get('step_index') == 548:
            for tc in obj.get('tool_calls', []):
                args = tc.get('args', {})
                rc = args.get('ReplacementContent', '')
                print('\n'.join(rc.splitlines()[230:350]))
