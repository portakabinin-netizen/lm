import zipfile
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

apk_path = r"C:\hipk\android\app\build\outputs\apk\release\app-release.apk"
zf = zipfile.ZipFile(apk_path, "r")

file_list = zf.namelist()
print(f"Total entries in APK: {len(file_list)}")

# Categories
assets = [f for f in file_list if f.startswith("assets/")]
res = [f for f in file_list if f.startswith("res/")]
dex = [f for f in file_list if f.endswith(".dex")]
lib = [f for f in file_list if f.startswith("lib/")]
root_files = [f for f in file_list if "/" not in f]

print(f"Assets: {len(assets)}")
print(f"Resources (res/): {len(res)}")
print(f"DEX classes: {len(dex)} ({', '.join(dex)})")
print(f"Native libs (lib/): {len(lib)}")
print(f"Root files: {len(root_files)} ({', '.join(root_files)})")

# Check all assets
print("\n--- All APK Assets ---")
for a in assets:
    info = zf.getinfo(a)
    print(f"  {a} ({info.file_size} bytes)")

# Check if any assets are missing from c:\hipk\assets\
assets_dir = r"C:\hipk\assets"
print("\n--- Checking c:\\hipk\\assets ---")
for root, _, files in os.walk(assets_dir):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), assets_dir).replace("\\", "/")
        print(f"  Local asset: assets/{rel}")
