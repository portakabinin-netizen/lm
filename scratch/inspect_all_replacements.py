import json

def get_tc(session_id, step_index):
    import os
    path = os.path.join(r"C:\Users\herry\.gemini\antigravity-ide\brain", session_id, ".system_generated", "logs", "transcript_full.jsonl")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if f'"step_index":{step_index}' in line:
                obj = json.loads(line)
                return obj.get("tool_calls", [])[0]
    return None

tc253 = get_tc("924d6424-27a0-4913-9bdf-a2ce3aee4056", 253)
print("=== TC 253 ===")
print("Name:", tc253["name"])
chunks253 = tc253["args"]["ReplacementChunks"]
print("Chunks:", len(chunks253))
for i, ch in enumerate(chunks253):
    print(f"--- Chunk {i} ({ch['StartLine']}-{ch['EndLine']}) ---")
    print("Target lines:", len(ch["TargetContent"].splitlines()))
    print("Repl lines:", len(ch["ReplacementContent"].splitlines()))

tc273 = get_tc("924d6424-27a0-4913-9bdf-a2ce3aee4056", 273)
print("\n=== TC 273 ===")
chunks273 = tc273["args"]["ReplacementChunks"]
print("Chunks:", len(chunks273))
for i, ch in enumerate(chunks273):
    print(f"--- Chunk {i} ({ch['StartLine']}-{ch['EndLine']}) ---")
    print("Target lines:", len(ch["TargetContent"].splitlines()))
    print("Repl lines:", len(ch["ReplacementContent"].splitlines()))

tc417 = get_tc("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 417)
print("\n=== TC 417 ===")
print("Target lines:", len(tc417["args"]["TargetContent"].splitlines()))
print("Repl lines:", len(tc417["args"]["ReplacementContent"].splitlines()))

tc421 = get_tc("153e79b4-00e0-41c6-ba97-4b8b7083ff82", 421)
print("\n=== TC 421 ===")
print("Target lines:", len(tc421["args"]["TargetContent"].splitlines()))
print("Repl lines:", len(tc421["args"]["ReplacementContent"].splitlines()))
