import json, sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\36afcdb8-d594-4610-b09e-afe11607ccbc\.system_generated\logs\transcript_full.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in [614, 655, 657, 659, 660]:
            tcs = obj.get('tool_calls', [])
            for tc in tcs:
                name = tc.get('name') or tc.get('function', {}).get('name')
                params = tc.get('args') or tc.get('parameters', {})
                print(f"Step {idx} tool {name}: TargetFile={params.get('TargetFile')}, Instruction={params.get('Instruction')}")
                rc = params.get('ReplacementContent', '')
                if rc:
                    out_path = f"c:/hipk/scratch/step_{idx}_rc.txt"
                    with open(out_path, 'w', encoding='utf-8') as out:
                        out.write(rc)
                    print(f"  Wrote {out_path} (len {len(rc)})")
