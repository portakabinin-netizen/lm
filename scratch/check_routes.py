import re

with open(r'C:\hipk\scratch\apk_extracted\index.android.bundle', 'rb') as f:
    bundle = f.read().decode('latin1', errors='ignore')

# Check occurrences of myscript
myscript_count = bundle.count('myscript')
print(f"Occurrences of 'myscript' in APK bundle: {myscript_count}")

# Check specific phrases
phrases = [
    "MIS Report Management",
    "User Login",
    "Sign In",
    "Guest Access Granted",
    "Welcome Back",
    "checkRegistration",
    "checkMobileExists",
    "stylesIndex",
    "ProtectedStack"
]

print("\n--- Checking key phrases in APK bundle ---")
for p in phrases:
    found = p in bundle
    count = bundle.count(p)
    print(f"  '{p}': found={found} (count={count})")

# Check which routes are registered
# Look for route paths like "./Signin", "./Signup", "./myscript/Signin"
route_matches = set(re.findall(r'\./[a-zA-Z0-9_\-]+(?:\.[jt]sx?)?', bundle))
print(f"\n--- Found {len(route_matches)} root-level route matches ---")
for r in sorted(route_matches)[:30]:
    print("  ", r)

myscript_routes = set(re.findall(r'\./myscript/[a-zA-Z0-9_\-]+(?:\.[jt]sx?)?', bundle))
print(f"\n--- Found {len(myscript_routes)} myscript route matches ---")
for r in sorted(myscript_routes)[:30]:
    print("  ", r)
