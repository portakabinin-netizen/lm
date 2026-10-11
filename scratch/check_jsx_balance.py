import re

with open(r"c:\hipk\scratch\reconstructed_sep30_clean.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Check from line 2410 to 3735
sub_lines = lines[2409:3735]

stack = []
for idx, line in enumerate(sub_lines, start=2410):
    # Find all JSX tags in line
    tags = re.findall(r'<\/?([A-Za-z0-9_]+)(?:\s+[^>]*?)?(\/?)>', line)
    for tag, self_closing in tags:
        if self_closing == '/':
            continue
        if tag.startswith('/'):
            close_tag = tag[1:]
            if not stack:
                print(f"Error at line {idx}: extra closing tag </{close_tag}>")
            else:
                last = stack.pop()
                if last[0] != close_tag:
                    print(f"Mismatch at line {idx}: expected </{last[0]}> (opened at {last[1]}), got </{close_tag}>")
        else:
            stack.append((tag, idx))

print("Unclosed tags remaining on stack:")
for tag, l_idx in stack:
    print(f"  <{tag}> opened at line {l_idx}")
