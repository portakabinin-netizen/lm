import os
import glob
from datetime import datetime

targets = ['ledgerMaster.tsx', 'profitAndLoss.tsx', 'BackgroundTasks.ts', 'LiveTracker.tsx', 'appHelper.tsx', 'AppHeader.tsx', 'rolebasemenu.json']
search_roots = [r'c:\hipk', r'c:\hipk230826', r'c:\reverseCodes', r'c:\Users\herry\Dropbox']

print(f"{'Filename':<24} | {'Size':<8} | {'Modified Time':<20} | Path")
print("-" * 90)
for root in search_roots:
    for dirpath, dirnames, filenames in os.walk(root):
        if 'node_modules' in dirpath or '.git' in dirpath:
            continue
        for f in filenames:
            for t in targets:
                if f.lower() == t.lower():
                    fp = os.path.join(dirpath, f)
                    try:
                        sz = os.path.getsize(fp)
                        mtime = datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d %H:%M:%S')
                        print(f"{f:<24} | {sz:<8} | {mtime:<20} | {fp}")
                    except Exception as e:
                        pass
