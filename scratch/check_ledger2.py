import json

s = r'C:\Users\herry\.gemini\antigravity-ide\brain\e10e229c-a314-4829-8879-eabd9bfcc598\.system_generated\logs\transcript_full.jsonl'
with open(s, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        obj = json.loads(line)
        if obj.get('step_index') == 65:
            pass
        # look for view_file of FinanceDashboard.tsx that has line 885
        content = obj.get('content', '')
        if 'Consolidated Worker Ledger (Dues vs Paid)' in content:
            print(f"Step {obj.get('step_index')} content:")
            for l in content.splitlines():
                if any(k in l for k in ['Consolidated Worker Ledger', 'NAME', 'LOGGED EARN', 'BOOKED DUE', 'PAID OUT', 'BAL DUE', 'GEN', 'DUE', 'PAID', 'BAL']):
                    print(l)
