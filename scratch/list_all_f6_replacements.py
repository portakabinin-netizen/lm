import json, sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

# Read all replace_file_content calls on FinanceDashboard.tsx in f64bcf3c
replacements = []
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        tcs = obj.get('tool_calls', [])
        for tc in tcs:
            if tc.get('name') == 'replace_file_content' or tc.get('function', {}).get('name') == 'replace_file_content':
                params = tc.get('args') or tc.get('parameters', {})
                target_file = params.get('TargetFile', '')
                if 'FinanceDashboard.tsx' in target_file:
                    replacements.append({
                        'step': idx,
                        'desc': params.get('Description', '') or params.get('Instruction', ''),
                        'target': params.get('TargetContent', ''),
                        'replacement': params.get('ReplacementContent', '')
                    })

print(f"Total replacements on FinanceDashboard.tsx in f64bcf3c: {len(replacements)}")
for r in replacements:
    print(f"  Step {r['step']}: {r['desc'][:70]} (target: {len(r['target'])}, repl: {len(r['replacement'])})")
