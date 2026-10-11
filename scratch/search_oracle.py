import os, json

base = r'C:\Users\herry\.gemini\antigravity-ide\brain'

found = []
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('transcript_full.jsonl'):
            fp = os.path.join(root, f)
            with open(fp, 'r', encoding='utf-8', errors='ignore') as fl:
                for idx, line in enumerate(fl):
                    if '80.225.215.140' in line:
                        found.append((fp, idx, line))

with open(r'c:\hipk\scratch\oracle_search.txt', 'w', encoding='utf-8') as out:
    for fp, idx, line in found:
        out.write(f'FILE: {fp} (line {idx})\n')
        out.write(line[:2000] + '\n\n')

print(f'Done, found {len(found)} occurrences')
