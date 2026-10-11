import json

f1 = r"c:\Users\herry\Dropbox\webHiBiz\rolebasemenu.json"
f2 = r"c:\hipk\UtilServices\RoleBaseMenu.json"
f3 = r"c:\hipk\context\RoleBaseMenu.json"

for path in [f1, f2, f3]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"\n=== {path} ===")
            print(f"Type: {type(data)}")
            if isinstance(data, dict):
                print(f"Keys ({len(data.keys())}): {list(data.keys())[:10]}")
            elif isinstance(data, list):
                print(f"Items count: {len(data)}")
                if data:
                    print(f"First item keys: {list(data[0].keys()) if isinstance(data[0], dict) else data[0]}")
    except Exception as e:
        print(f"Error {path}: {e}")
