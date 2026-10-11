import json, sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        tcs = obj.get('tool_calls', [])
        for tc in tcs:
            if tc.get('name') == 'replace_file_content' or tc.get('function', {}).get('name') == 'replace_file_content':
                params = tc.get('args') or tc.get('parameters', {})
                desc = params.get('Description', '') or params.get('Instruction', '')
                tc_str = str(params.get('TargetContent', ''))
                rc_str = str(params.get('ReplacementContent', ''))
                if 'FinancialComparisonLineChart' in tc_str or 'FinancialComparisonLineChart' in rc_str or 'chart' in desc.lower():
                    print(f"Step {idx}: {desc[:100]} (Target len: {len(tc_str)}, Repl len: {len(rc_str)})")
