#!/usr/bin/env python3
import json, lzma, urllib.parse, urllib.request
from pathlib import Path
import ijson

BASE = "https://mtgjson.com/api/v5"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "mtgjson-history.json"
TMP = ROOT / ".history-cache"
TMP.mkdir(exist_ok=True)

PRICE_MIN, PRICE_MAX = 2, 80
QUERY = f"game:paper usd>={PRICE_MIN} usd<={PRICE_MAX} -is:reserved"
SCRYFALL = "https://api.scryfall.com/cards/search?unique=cards&order=edhrec&dir=asc&q=" + urllib.parse.quote(QUERY)
UA = {"User-Agent": "MTGDealHunter/3.9 history-cache", "Accept": "application/json"}


def fetch_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def download(url, path):
    if path.exists() and path.stat().st_size > 1024:
        return
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


def get_targets():
    data = fetch_json(SCRYFALL)
    cards = (data.get("data") or [])[:120]
    return {c["id"]: {"name": c.get("name"), "set": c.get("set"), "collector_number": c.get("collector_number")} for c in cards if c.get("id")}


def map_uuids(targets, identifiers_xz):
    scryfall_ids = set(targets)
    uuid_to_scryfall = {}
    with lzma.open(identifiers_xz, "rb") as f:
        for uuid, card in ijson.kvitems(f, "data"):
            sid = ((card or {}).get("identifiers") or {}).get("scryfallId")
            if sid in scryfall_ids:
                uuid_to_scryfall[uuid] = sid
                if len(set(uuid_to_scryfall.values())) >= len(scryfall_ids):
                    break
    return uuid_to_scryfall


def extract_prices(uuid_to_scryfall, prices_xz):
    wanted = set(uuid_to_scryfall)
    out = {}
    with lzma.open(prices_xz, "rb") as f:
        for uuid, formats in ijson.kvitems(f, "data"):
            if uuid not in wanted:
                continue
            tcg = (((formats or {}).get("paper") or {}).get("tcgplayer") or {})
            retail = (tcg.get("retail") or {})
            normal = retail.get("normal") or {}
            if not normal:
                continue
            sid = uuid_to_scryfall[uuid]
            points = []
            for date, price in sorted(normal.items()):
                try:
                    p = float(price)
                except (TypeError, ValueError):
                    continue
                if p > 0:
                    points.append({"date": date, "price": p})
            if points:
                # Prefer the mapping with the fullest history if MTGJSON has duplicate UUID records for a Scryfall printing.
                if sid not in out or len(points) > len(out[sid]["points"]):
                    out[sid] = {"provider": "tcgplayer", "list": "retail", "finish": "normal", "points": points[-90:]}
    return out


def main():
    targets = get_targets()
    identifiers_xz = TMP / "AllIdentifiers.json.xz"
    prices_xz = TMP / "AllPrices.json.xz"
    download(f"{BASE}/AllIdentifiers.json.xz", identifiers_xz)
    download(f"{BASE}/AllPrices.json.xz", prices_xz)
    uuid_to_scryfall = map_uuids(targets, identifiers_xz)
    prices = extract_prices(uuid_to_scryfall, prices_xz)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "MTGJSON AllPrices",
        "provider": "tcgplayer retail normal",
        "resolution": "daily",
        "days": 90,
        "target_count": len(targets),
        "matched_count": len(prices),
        "cards": prices,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(prices)} historical series to {OUT}")


if __name__ == "__main__":
    main()
