#!/usr/bin/env python3
"""Pull full Drifella 2 collection metadata via Helius DAS getAssetsByGroup.

Writes one JSON line per asset to das-assets.jsonl. No images downloaded.
"""
import json, sys, time, urllib.request
from pathlib import Path

HELIUS_KEY = "b5005d86-3c29-4607-a852-41cd57dc9c99"
HELIUS_RPC = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_KEY}"
COLLECTION = "7cHTjqr2S8uUCrG3TVFvFix3vcLjhPiwrtRsAeJtESRj"
OUT = Path(__file__).parent / "das-assets.jsonl"
PAGE_LIMIT = 1000


def rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(HELIUS_RPC, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main():
    page = 1
    total = 0
    with OUT.open("w") as f:
        while True:
            for attempt in range(4):
                try:
                    resp = rpc("getAssetsByGroup", {
                        "groupKey": "collection",
                        "groupValue": COLLECTION,
                        "page": page,
                        "limit": PAGE_LIMIT,
                        "options": {"showFungible": False},
                    })
                    break
                except Exception as e:
                    if attempt == 3:
                        raise
                    print(f"  retry {attempt+1}: {e}", file=sys.stderr)
                    time.sleep(2 ** attempt)

            if "error" in resp:
                print(f"DAS error page {page}: {resp['error']}", file=sys.stderr)
                sys.exit(1)
            result = resp.get("result", {})
            items = result.get("items", [])
            if not items:
                break
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
            total += len(items)
            grand = result.get("grand_total") or result.get("total")
            print(f"page {page}: +{len(items)} (total {total}{f' of {grand}' if grand else ''})")
            if len(items) < PAGE_LIMIT:
                break
            page += 1
            time.sleep(0.2)
    print(f"\nwrote {total} assets -> {OUT}")


if __name__ == "__main__":
    main()
