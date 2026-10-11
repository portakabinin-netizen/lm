import re
import os

bundle_path = r"C:\hipk\scratch\apk_extracted\index.android.bundle"

with open(bundle_path, "rb") as f:
    data = f.read()

# Extract all ASCII/UTF-8 strings of length >= 4
pattern = re.compile(rb"[\x20-\x7E]{4,}")
raw_strings = pattern.findall(data)
strings = [s.decode("latin1", errors="ignore") for s in raw_strings]

print(f"Total extracted strings: {len(strings)}")

# Look for module paths, file paths, route definitions, component names
module_candidates = set()
route_candidates = set()
api_endpoints = set()

for s in strings:
    # File/module paths
    if any(s.startswith(prefix) or f"/{prefix}" in s for prefix in ["app/", "components/", "modal/", "services/", "utils/", "hooks/", "context/", "constants/", "dashboards/", "UtilServices/"]):
        module_candidates.add(s)
    # Routes
    if s.startswith("/") and len(s) > 1 and not s.startswith("//") and not s.startswith("/*"):
        if any(keyword in s for keyword in ["signin", "signup", "dashboard", "lead", "staff", "attendance", "finance", "bill", "vendor", "salary", "voucher", "site", "duty", "setting", "myscript"]):
            route_candidates.add(s)
    # API endpoints
    if "/service/" in s or "/api/" in s or s.startswith("service/") or s.startswith("api/"):
        api_endpoints.add(s)

print(f"\n--- Found {len(module_candidates)} module/file path references ---")
for m in sorted(module_candidates)[:50]:
    print("  ", m)

print(f"\n--- Found {len(route_candidates)} route path references ---")
for r in sorted(route_candidates)[:50]:
    print("  ", r)

print(f"\n--- Found {len(api_endpoints)} API endpoints ---")
for a in sorted(api_endpoints)[:50]:
    print("  ", a)

# Save all extracted strings to a text file for complete analysis
out_txt = r"C:\hipk\scratch\bundle_strings.txt"
with open(out_txt, "w", encoding="utf-8") as out_f:
    for s in strings:
        out_f.write(s + "\n")
print(f"\nAll strings written to {out_txt}")
