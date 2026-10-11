import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

bundle_path = r"C:\reverseCodes\assets\index.android.bundle"
with open(bundle_path, "rb") as f:
    bundle = f.read().decode('latin1', errors='ignore')

root_dir = r"C:\hipk"

# 1. Find all routes in app/
all_root_screens = []
for root, _, files in os.walk(os.path.join(root_dir, "app")):
    for f in files:
        if f.endswith((".tsx", ".jsx", ".js", ".ts")) and not f.endswith(".d.ts"):
            rel = os.path.relpath(os.path.join(root, f), root_dir).replace("\\", "/")
            all_root_screens.append(rel)

print(f"Total screens/routes in c:/hipk/app: {len(all_root_screens)}")

# 2. Check each screen's presence in APK bundle
present_in_apk = []
missing_in_apk = []

for scr in sorted(all_root_screens):
    # Check if file path or base name appears in bundle
    # In Expo router, files in app/ are registered like "./myscript/Signin.tsx" or "./Signin.tsx"
    sub_path = scr.replace("app/", "./")
    base_name = os.path.splitext(os.path.basename(scr))[0]
    
    # Also check unique strings inside the source file
    full_path = os.path.join(root_dir, scr.replace("/", "\\"))
    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as sf:
            source_content = sf.read()
    except:
        source_content = ""
        
    quoted = re.findall(r'["\']([^"\'\n]{8,50})["\']', source_content)
    # Check how many unique strings from source are in bundle
    matches = sum(1 for q in quoted if q in bundle)
    total_quoted = len(quoted)
    ratio = (matches / total_quoted) if total_quoted > 0 else 0

    in_bundle = (sub_path in bundle) or (ratio > 0.4 and total_quoted >= 3)
    if in_bundle:
        present_in_apk.append((scr, matches, total_quoted, f"{ratio*100:.0f}%"))
    else:
        missing_in_apk.append((scr, matches, total_quoted, f"{ratio*100:.0f}%"))

print(f"\n--- Screens confirmed present in APK ({len(present_in_apk)}) ---")
for s, m, t, r in present_in_apk:
    print(f"  ✅ {s:<35} ({m}/{t} strings matched, {r})")

print(f"\n--- Screens NOT in APK ({len(missing_in_apk)}) ---")
for s, m, t, r in missing_in_apk:
    print(f"  ❌ {s:<35} ({m}/{t} strings matched, {r})")
