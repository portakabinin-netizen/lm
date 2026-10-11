import os
from datetime import datetime

targets = ['ledgermaster.tsx', 'profitandloss.tsx', 'backgroundtasks.ts', 'livetracker.tsx', 'apphelper.tsx', 'appheader.tsx', 'rolebasemenu.json']
search_dirs = [
    r'c:\Users\herry\Dropbox\HIPK',
    r'c:\Users\herry\Dropbox\GitLabBackEnd',
    r'c:\Users\herry\Dropbox\myscript',
    r'c:\Users\herry\Downloads',
    r'c:\Users\herry\Desktop',
    r'c:\Users\herry\Documents',
    r'c:\Users\herry\.gemini\antigravity-ide\brain',
]

for sdir in search_dirs:
    if not os.path.exists(sdir):
        continue
    for dirpath, dirnames, filenames in os.walk(sdir):
        # avoid node_modules
        if 'node_modules' in dirpath:
            continue
        for f in filenames:
            fl = f.lower()
            if fl in targets:
                fp = os.path.join(dirpath, f)
                try:
                    sz = os.path.getsize(fp)
                    mtime = datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d %H:%M:%S')
                    print(f"{f:<24} | {sz:<8} | {mtime:<20} | {fp}")
                except:
                    pass
