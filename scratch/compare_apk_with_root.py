import json
import os
import re

out_dir = r"C:\reverseCodes"
root_dir = r"C:\hipk"

with open(os.path.join(out_dir, "analysis_summary.json"), "r", encoding="utf-8") as f:
    apk_analysis = json.load(f)

print("=== APK Bundle Summary ===")
print("Hermes version:", apk_analysis["hermes_version"])
print("Function count:", apk_analysis["function_count"])
print("Total strings:", apk_analysis["total_extracted_strings"])

print("\n--- Routes in APK ---")
for r in apk_analysis["route_references"]:
    print(" ", r)

print("\n--- Source file references in APK ---")
for s in apk_analysis["source_file_references"]:
    print(" ", s)

print("\n--- Checking existence of these files in c:\\hipk ---")
missing_in_root = []
found_in_root = []
for s in apk_analysis["source_file_references"]:
    # clean path if needed
    cleaned = s.split(" ")[0].replace("/", "\\")
    full_path = os.path.join(root_dir, cleaned)
    if os.path.exists(full_path):
        found_in_root.append(cleaned)
    else:
        # try adding extensions
        found = False
        for ext in [".tsx", ".ts", ".js", ".jsx", ".json"]:
            if os.path.exists(full_path + ext):
                found_in_root.append(cleaned + ext)
                found = True
                break
        if not found:
            missing_in_root.append(cleaned)

print(f"Found in c:\\hipk: {len(found_in_root)}")
print(f"Missing in c:\\hipk: {len(missing_in_root)}")
if missing_in_root:
    print("Missing list:")
    for m in missing_in_root[:30]:
        print("  ❌", m)
