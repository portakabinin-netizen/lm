import os
import json

with open(r"c:\hipk\scratch\reconstructed_clean_base.tsx", "r", encoding="utf-8") as f:
    code = f.read()

def get_tc(session_id, step_index):
    path = os.path.join(r"C:\Users\herry\.gemini\antigravity-ide\brain", session_id, ".system_generated", "logs", "transcript_full.jsonl")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if f'"step_index":{step_index}' in line:
                obj = json.loads(line)
                return obj.get("tool_calls", [])[0]
    return None

# TC 253
tc253 = get_tc("924d6424-27a0-4913-9bdf-a2ce3aee4056", 253)
chunks253 = tc253["args"]["ReplacementChunks"]
print("Applying TC 253 chunks (total 6):")
for i, ch in enumerate(chunks253):
    tgt = ch["TargetContent"]
    rep = ch["ReplacementContent"]
    if tgt in code:
        code = code.replace(tgt, rep)
        print(f"  Chunk {i} applied!")
    else:
        print(f"  Chunk {i} NOT FOUND!")
        print("   Target snippet:", repr(tgt[:80]))

# TC 273
tc273 = get_tc("924d6424-27a0-4913-9bdf-a2ce3aee4056", 273)
chunks273 = tc273["args"]["ReplacementChunks"]
print("\nApplying TC 273 chunks (total 4):")
for i, ch in enumerate(chunks273):
    tgt = ch["TargetContent"]
    rep = ch["ReplacementContent"]
    if tgt in code:
        code = code.replace(tgt, rep)
        print(f"  Chunk {i} applied!")
    else:
        print(f"  Chunk {i} NOT FOUND!")
        print("   Target snippet:", repr(tgt[:80]))

# TC 417
tc417 = get_tc("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 417)
tgt417 = tc417["args"]["TargetContent"]
rep417 = tc417["args"]["ReplacementContent"]
if tgt417 in code:
    code = code.replace(tgt417, rep417)
    print("\nTC 417 applied!")
else:
    print("\nTC 417 NOT FOUND!")

# TC 421
tc421 = get_tc("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 421)
tgt421 = tc421["args"]["TargetContent"]
rep421 = tc421["args"]["ReplacementContent"]
if tgt421 in code:
    code = code.replace(tgt421, rep421)
    print("TC 421 applied!")
else:
    print("TC 421 NOT FOUND!")

print(f"Final reconstructed file lines: {len(code.splitlines())}")

with open(r"c:\hipk\scratch\reconstructed_sep30_clean.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Saved reconstructed_sep30_clean.tsx!")
