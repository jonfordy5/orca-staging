#!/usr/bin/env python3
"""Build static, compact, per-letter company reference shards for ORCA staging.

Source: JerBouma/FinanceDatabase (MIT, copyright 2023 Jeroen Bouma).
These are reference facts, NOT live market data. Do not copy third-party logos.
"""
from __future__ import annotations

import csv
import io
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database/equities/"
EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE", "AQS")
OUTPUT = Path("data/company-profile-index")
SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,11}$")
HEADERS = {"User-Agent": "ORCA-staging-public-company-profile-index/1.0"}
VALID_COUNTRY = {"United States", "USA", "US", ""}


def clean(value: object, max_length: int = 180) -> str:
    text = str(value or "").strip()
    if text.lower() in {"nan", "none", "null", "n/a"}:
        return ""
    return text[:max_length]


def normalized_row(row: dict[str, str], market: str) -> tuple[str, dict] | None:
    symbol = clean(row.get("symbol"), 20).upper()
    if not SYMBOL.fullmatch(symbol):
        return None
    if clean(row.get("country")) not in VALID_COUNTRY:
        return None
    result = {"name": clean(row.get("name"), 160),
              "sector": clean(row.get("sector")),
              "industry": clean(row.get("industry")),
              "city": clean(row.get("city")),
              "state": clean(row.get("state"), 100),
              "country": clean(row.get("country")),
              "exchange": clean(row.get("exchange")) or market}
    address = clean(row.get("website"), 300)
    if address.startswith("https://") and "." in address.split("/")[2]:
        result["website"] = address
    # Filter unavailable source fields, but retain the symbol/name.
    result = {k: v for k, v in result.items() if v}
    if not result.get("name"):
        return None
    return symbol, result


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = {}
    sources = []
    for market in EXCHANGES:
        url = BASE + market + ".csv"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as response:
                data = response.read().decode("utf-8-sig")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"Skipping {market}: {exc}", flush=True)
            continue
        reader = csv.DictReader(io.StringIO(data))
        if not reader.fieldnames or not {"symbol", "name"}.issubset(set(reader.fieldnames)):
            print(f"Unexpected columns in {market}; skipped", flush=True)
            continue
        count = 0
        for row in reader:
            item = normalized_row(row, market)
            if item:
                symbol, details = item
                if symbol not in records or len(details) > len(records[symbol]):
                    records[symbol] = details
                count += 1
        print(f"Read {market}: {count} usable reference rows", flush=True)
        sources.append(market)
    # Avoid overwriting a good snapshot with an empty or partial upstream outage.
    if len(sources) < 3 or len(records) < 1000:
        raise RuntimeError(f"Source incomplete ({len(sources)} exchanges, {len(records)} tickers). No output written.")
    shards = {}
    for symbol, details in records.items():
        key = symbol[0] if symbol[0].isalpha() else "0"
        shards.setdefault(key, {})[symbol] = details
    for key, values in sorted(shards.items()):
        output = OUTPUT / (key + ".json")
        output.write_text(json.dumps(dict(sorted(values.items())), ensure_ascii=False,
                                     separators=(",", ":")) + "\n", encoding="utf-8")
    (OUTPUT / "metadata.json").write_text(json.dumps({
        "source": "JerBouma/FinanceDatabase",
        "source_url": "https://github.com/JerBouma/FinanceDatabase",
        "license": "MIT (copyright 2023 Jeroen Bouma)",
        "exchanges": sources, "count": len(records),
        "usage": "Company reference metadata only; prices, valuations, logos, and photos excluded."
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} ticker profiles across {len(shards)} small shards", flush=True)


if __name__ == "__main__":
    build()
