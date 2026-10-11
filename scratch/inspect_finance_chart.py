import json, sys
sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        if obj.get('step_index') == 151:
            content = obj.get('content', '')
            lines = content.split('\n')
            for i, l in enumerate(lines):
                if '5570:' in l:
                    for sub in lines[i:i+150]:
                        print(sub)
                    break
