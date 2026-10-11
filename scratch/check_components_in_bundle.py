import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

root_dir = r"C:\hipk"

# Build an index of all ts/tsx file basenames in the project
existing_basenames = {}
for dirpath, _, filenames in os.walk(root_dir):
    if any(skip in dirpath for skip in ["node_modules", ".git", "venv", ".expo", "scratch"]):
        continue
    for fn in filenames:
        if fn.endswith((".tsx", ".ts", ".js", ".jsx")):
            name_no_ext = os.path.splitext(fn)[0]
            rel_p = os.path.relpath(os.path.join(dirpath, fn), root_dir).replace("\\", "/")
            existing_basenames.setdefault(name_no_ext, []).append(rel_p)

# Known component/modal/service patterns
suffixes = ["Modal", "Dashboard", "Service", "Screen", "Tile", "Card", "Picker", "Tab", "Context", "Helper", "Router"]

found_identifiers = set()

with open(r"C:\hipk\scratch\bundle_strings.txt", "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        # split by non-alphanumeric
        tokens = [t.strip() for t in line.replace('"', ' ').replace("'", ' ').replace(';', ' ').replace('.', ' ').replace('/', ' ').replace('(', ' ').replace(')', ' ').replace(':', ' ').replace(',', ' ').split()]
        for t in tokens:
            if any(t.endswith(sfx) for sfx in suffixes) and len(t) > 4:
                # ignore third party libraries
                if any(lib in t for lib in ["RCT", "Native", "Reanimated", "Gesture", "LayoutAnimation"]):
                    continue
                found_identifiers.add(t)

print(f"Total matching identifiers in bundle: {len(found_identifiers)}")

matched = []
missing = []

for ident in sorted(found_identifiers):
    if ident in existing_basenames:
        matched.append((ident, existing_basenames[ident]))
    else:
        missing.append(ident)

print(f"Matched components/services: {len(matched)}")
print(f"Unmatched identifiers: {len(missing)}")

print("\n--- Top Matched Components / Services ---")
for m in matched:
    print(f"  [OK] {m[0]} -> {', '.join(m[1])}")

print("\n--- Unmatched Identifiers to investigate ---")
for u in missing:
    print(f"  [?] {u}")
