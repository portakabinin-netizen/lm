import json

f_web = r"c:\Users\herry\Dropbox\webHiBiz\rolebasemenu.json"
f_app = r"c:\hipk\UtilServices\RoleBaseMenu.json"

with open(f_web, "r", encoding="utf-8") as f:
    web = json.load(f)
with open(f_app, "r", encoding="utf-8") as f:
    app = json.load(f)

print("Web roles:", list(web.get("roles", {}).keys()))
print("App roles:", list(app.keys()))

for r in app:
    sections = app[r].get("sections", [])
    print(f"App role '{r}': {len(sections)} sections -> {[s.get('sectionTitle') for s in sections]}")
