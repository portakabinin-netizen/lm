import json, sys
sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        tcs = obj.get('tool_calls', [])
        for tc in tcs:
            params = tc.get('args') or tc.get('parameters', {})
            rc = params.get('ReplacementContent', '')
            if 'directExpenses' in rc:
                idx = obj.get('step_index')
                desc = params.get('Description', '') or params.get('Instruction', '')
                print(f"Step {idx}: {desc} (len {len(rc)})")
                with open(f"c:/hipk/scratch/step_{idx}_direct.txt", "w", encoding="utf-8") as out:
                    out.write(rc)
