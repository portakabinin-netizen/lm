import json, os, sys

sessions = [
    r'C:\Users\herry\.gemini\antigravity-ide\brain\d5255dec-3ed4-456c-a420-4e597947e6f0\.system_generated\logs\transcript_full.jsonl',
    r'C:\Users\herry\.gemini\antigravity-ide\brain\89d39ee6-698d-4d6a-8eae-5141dc08fca6\.system_generated\logs\transcript_full.jsonl',
    r'C:\Users\herry\.gemini\antigravity-ide\brain\e10e229c-a314-4829-8879-eabd9bfcc598\.system_generated\logs\transcript_full.jsonl'
]

for s in sessions:
    try:
        sess_name = os.path.basename(os.path.dirname(os.path.dirname(s)))
        with open(s, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if 'CONSOLIDATED WORKER LEDGER' in line.upper():
                    obj = json.loads(line)
                    print(f'=== Session {sess_name} step {obj.get("step_index")} type {obj.get("type")} ===')
                    for tc in obj.get('tool_calls', []):
                        name = tc.get('name')
                        args = tc.get('args', {})
                        print(f'Tool: {name}, Target: {args.get("TargetFile")}')
                        content = args.get('ReplacementContent') or args.get('CodeContent') or ''
                        if content:
                            lines = content.splitlines()
                            for i, l in enumerate(lines):
                                if 'CONSOLIDATED WORKER LEDGER' in l.upper():
                                    start = max(0, i - 10)
                                    end = min(len(lines), i + 35)
                                    print('\n'.join(lines[start:end]))
                                    print('---')
                    # also check content if it was a view_file response
                    resp_content = obj.get('content', '')
                    if 'CONSOLIDATED WORKER LEDGER' in resp_content.upper():
                        rlines = resp_content.splitlines()
                        for i, l in enumerate(rlines):
                            if 'CONSOLIDATED WORKER LEDGER' in l.upper():
                                start = max(0, i - 10)
                                end = min(len(rlines), i + 35)
                                print(f'Response in step {obj.get("step_index")}:')
                                print('\n'.join(rlines[start:end]))
                                print('---')
    except Exception as e:
        print(f'Error reading {s}: {e}')
