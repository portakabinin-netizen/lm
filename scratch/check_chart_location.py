import json, sys
sys.stdout.reconfigure(encoding='utf-8')

transcript_path = r'C:\Users\herry\.gemini\antigravity-ide\brain\f64bcf3c-0e80-4c4f-9c05-5475f6859eec\.system_generated\logs\transcript_full.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        content = obj.get('content', '')
        if 'Showing lines 600 to' in content or 'Showing lines 620 to' in content or 'Showing lines 640 to' in content:
            print("Step", obj.get('step_index'))
            for l in content.split('\n')[:30]:
                print(l)
            break
