import json

s = r'C:\Users\herry\.gemini\antigravity-ide\brain\e10e229c-a314-4829-8879-eabd9bfcc598\.system_generated\logs\transcript_full.jsonl'
with open(s, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index')
        if idx in range(65, 80):
            # print tool calls or content
            tc = obj.get('tool_calls', [])
            if tc:
                print(f"Step {idx} tool calls: {[t.get('name') for t in tc]}")
            if obj.get('type') == 'VIEW_FILE' or 'File Path:' in obj.get('content', ''):
                content = obj.get('content', '')
                if 'Consolidated Worker Ledger' in content:
                    print(f"Step {idx} view_file snippet:")
                    lines = content.splitlines()
                    for l in lines:
                        if '880:' in l or '885:' in l or '890:' in l or '895:' in l or '900:' in l or '905:' in l or '910:' in l or '915:' in l:
                            print(l)
