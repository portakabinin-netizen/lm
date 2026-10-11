import struct
import json
import os
import re

bundle_path = r"C:\reverseCodes\assets\index.android.bundle"
out_dir = r"C:\reverseCodes"

with open(bundle_path, "rb") as f:
    data = f.read()

version = struct.unpack('<I', data[8:12])[0]
file_len = struct.unpack('<I', data[32:36])[0]
func_count = struct.unpack('<I', data[40:44])[0]
string_kind_count = struct.unpack('<I', data[44:48])[0]
identifier_count = struct.unpack('<I', data[48:52])[0]
string_count = struct.unpack('<I', data[52:56])[0]

print(f"Hermes version: {version}")
print(f"File length: {file_len} (actual: {len(data)})")
print(f"Functions: {func_count}")
print(f"Identifiers: {identifier_count}")
print(f"Strings: {string_count}")

ascii_strings = re.findall(rb'[\x20-\x7E]{3,}', data)
decoded_strings = []
for s in ascii_strings:
    try:
        decoded_strings.append(s.decode('utf-8'))
    except UnicodeDecodeError:
        decoded_strings.append(s.decode('latin1'))

print(f"Total ASCII/UTF-8 string sequences extracted: {len(decoded_strings)}")

source_files = set()
routes = set()
apis = set()
env_keys = set()

for s in decoded_strings:
    if any(s.startswith(p) for p in ['app/', 'components/', 'modal/', 'services/', 'utils/', 'hooks/', 'context/', 'constants/', 'dashboards/', 'UtilServices/']):
        source_files.add(s)
    elif s.startswith('/') and len(s) > 1 and not s.startswith('//'):
        if any(w in s.lower() for w in ['signin', 'signup', 'auth', 'service', 'lead', 'attendance', 'myscript']):
            routes.add(s)
    elif 'http://' in s or 'https://' in s:
        apis.add(s)
    elif s.startswith('EXPO_PUBLIC_') or s in ['JWT_SECRET', 'MONGO_URI', 'CLOUDINARY_URL']:
        env_keys.add(s)

report = {
    "hermes_version": version,
    "function_count": func_count,
    "string_count": string_count,
    "total_extracted_strings": len(decoded_strings),
    "source_file_references": sorted(list(source_files)),
    "route_references": sorted(list(routes)),
    "api_references": sorted(list(apis)),
    "env_key_references": sorted(list(env_keys)),
}

with open(os.path.join(out_dir, "analysis_summary.json"), "w", encoding="utf-8") as out_f:
    json.dump(report, out_f, indent=2)

with open(os.path.join(out_dir, "all_extracted_strings.txt"), "w", encoding="utf-8") as out_f:
    for s in decoded_strings:
        out_f.write(s + "\n")

print("Generated analysis_summary.json and all_extracted_strings.txt successfully.")
