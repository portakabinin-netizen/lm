import re

with open(r'C:\hipk\scratch\apk_extracted\index.android.bundle', 'rb') as f:
    bundle = f.read().decode('latin1', errors='ignore')

# Search for baseURL or axios.create
matches = re.findall(r'baseURL[^\,\}\;]{1,120}', bundle)
print("=== baseURL matches in bundle ===")
for m in matches[:20]:
    print("  ", m)

# Search for trycloudflare or onrender or pythonanywhere
for domain in ['trycloudflare', 'onrender', 'pythonanywhere', 'tradeindia', 'railway', 'localhost']:
    found = [m.start() for m in re.finditer(domain, bundle)]
    print(f"Domain '{domain}': {len(found)} occurrences")
    for pos in found[:5]:
        snippet = bundle[max(0, pos-40):min(len(bundle), pos+80)]
        print(f"   [{domain}] -> {snippet.replace(chr(10), ' ')}")
