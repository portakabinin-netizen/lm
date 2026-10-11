import json

path = r'C:\Users\herry\.gemini\antigravity-ide\brain\153e79b4-00e0-41c6-ba97-4b8b7083ff82\.system_generated\logs\transcript_full.jsonl'
with open(r'c:\hipk\scratch\found_env_steps.txt', 'w', encoding='utf-8') as out:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for i, line in enumerate(f):
            if 'c:/hipk/.env' in line or 'c:\\hipk\\.env' in line or 'c:\\\\hipk\\\\.env' in line:
                o = json.loads(line)
                out.write(f'=== Step {i} ===\n')
                out.write(o.get('content', '') + '\n')

print('Dumped env steps')
