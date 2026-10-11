import json, sys

sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in [809, 813, 821, 864, 916]:
            tcs = obj.get('tool_calls', [])
            for tc in tcs:
                params = tc.get('args') or tc.get('parameters', {})
                desc = params.get('Description', '') or params.get('Instruction', '')
                tc_c = params.get('TargetContent', '')
                rc_c = params.get('ReplacementContent', '')
                print(f"=== STEP {idx} ===")
                print(f"Desc: {desc}")
                print(f"Target lines ({tc_c.count(chr(10))}):")
                for l in tc_c.split('\n')[:3]:
                    print("  T>", l)
                print("  ...")
                for l in tc_c.split('\n')[-3:]:
                    print("  T>", l)
                print(f"Replacement lines ({rc_c.count(chr(10))}):")
                for l in rc_c.split('\n')[:3]:
                    print("  R>", l)
                print("  ...")
                for l in rc_c.split('\n')[-3:]:
                    print("  R>", l)
