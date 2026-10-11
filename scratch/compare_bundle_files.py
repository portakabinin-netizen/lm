import re

with open(r'C:\hipk\scratch\apk_extracted\index.android.bundle', 'rb') as f:
    bundle_data = f.read()

def check_file(path):
    print(f'=== Checking {path} ===')
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    # Find double-quoted and single-quoted strings
    strings = re.findall(r'["\']([^"\'\n]{6,60})["\']', content)
    found = []
    missing = []
    for s in set(strings):
        if s.encode('utf-8') in bundle_data:
            found.append(s)
        else:
            missing.append(s)
    print(f'Found: {len(found)}, Missing: {len(missing)}')
    print('  Sample found:', found[:8])
    print('  Sample missing:', missing[:8])

check_file(r'C:\hipk\app\Signin.tsx')
check_file(r'C:\hipk\app\myscript\Signin.tsx')
check_file(r'C:\hipk\app\index.tsx')
check_file(r'C:\hipk\app\myscript\index.tsx')
