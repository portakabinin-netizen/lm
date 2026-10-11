import urllib.request, json

def test_backend(name, base_url):
    print(f"\n--- Testing {name}: {base_url} ---")
    url = f"{base_url}/auth/check-unique"
    payload = json.dumps({"userMobile": "9212790790"}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            print(f"check-unique: Status {res.status}, Body: {res.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"check-unique HTTP {e.code}: {e.read().decode()}")
    except Exception as e:
        print(f"check-unique FAILED: {e}")

test_backend("Cloudflare Tunnel (/api)", "https://queen-discounts-carrier-along.trycloudflare.com/api")
test_backend("Render Live (/api)", "https://hipk-gsz6.onrender.com/api")
