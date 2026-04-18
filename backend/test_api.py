import urllib.request
import json

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

print("=== /health ===")
h = get("http://localhost:8000/health")
print(json.dumps(h, indent=2))

print("\n=== /api/hotspots (1st call) ===")
hs = get("http://localhost:8000/api/hotspots")
print(f"source : {hs.get('source')}")
print(f"count  : {hs.get('count')}")
if hs.get("data"):
    print(f"sample : {json.dumps(hs['data'][:1], indent=2)}")

print("\n=== /api/hotspots (2nd call — cached) ===")
hs2 = get("http://localhost:8000/api/hotspots")
print(f"source : {hs2.get('source')}")
print(f"count  : {hs2.get('count')}")

print("\n=== /api/hotspots/stats ===")
st = get("http://localhost:8000/api/hotspots/stats")
print(json.dumps(st, indent=2))

print("\n=== /api/hotspots/region (Amazon) ===")
url = "http://localhost:8000/api/hotspots/region?min_lat=-20&max_lat=10&min_lon=-75&max_lon=-45"
reg = get(url)
print(f"source : {reg.get('source')}")
print(f"count  : {reg.get('count')}")
print(f"bbox   : {reg.get('bbox')}")

print("\n=== /api/hotspots/region (validation error) ===")
bad = get("http://localhost:8000/api/hotspots/region?min_lat=10&max_lat=5&min_lon=0&max_lon=10")
print(json.dumps(bad, indent=2))

print("\nAll tests complete.")
