import json

def inspect_step(session_id, step_idx):
    path = rf"C:\Users\herry\.gemini\antigravity-ide\brain\{session_id}\.system_generated\logs\transcript_full.jsonl"
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            obj = json.loads(line)
            if obj.get("step_index") == step_idx:
                print(f"=== {session_id} Step {step_idx} ({obj.get('type')}) ===")
                tcs = obj.get("tool_calls", [])
                if tcs:
                    print("Tool call:", tcs[0].get("name"))
                    args = tcs[0].get("args", {})
                    for k in ['AbsolutePath', 'TargetFile', 'Description', 'StartLine', 'EndLine']:
                        if k in args:
                            print(f"  {k}: {args[k]}")
                content = obj.get("content", "")
                if content:
                    lines = content.splitlines()
                    print(f"Content lines: {len(lines)}, chars: {len(content)}")
                    print(f"First 2 lines: {lines[:2]}")
                    print(f"Last 2 lines: {lines[-2:]}")
                return

inspect_step("924d6424-27a0-4913-9bdf-a2ce3aee4056", 88)
inspect_step("924d6424-27a0-4913-9bdf-a2ce3aee4056", 87)
inspect_step("c1868f3b-9dde-4eb0-b055-98666af278ca", 673)
inspect_step("c1868f3b-9dde-4eb0-b055-98666af278ca", 735)
