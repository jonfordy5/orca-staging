"""Shared ORCA stock registry for scheduled SEC importers.

The database is the single ticker roster: newly registered stocks are included
without editing GitHub Actions. Deterministic daily batching avoids turning a
large community into a burst of requests to the SEC. Secrets stay server-side.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import date

BASE = "https://vbziibatnejoswsdggga.supabase.co"
TICKER = re.compile(r"^[A-Z][A-Z0-9.]{0,9}$")
MAX_BATCH = 60

def registered_tickers():
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not key.startswith("sb_secret_"):
        raise RuntimeError("SUPABASE_SECRET_KEY is required for the registered ticker roster")
    tickers = set()
    offset = 0
    while True:
        query = urllib.parse.urlencode({"select": "ticker", "order": "ticker.asc", "limit": 1000, "offset": offset})
        request = urllib.request.Request(
            BASE + "/rest/v1/stocks?" + query,
            headers={"apikey": key, "Accept": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            rows = json.load(response)
        if not isinstance(rows, list):
            raise RuntimeError("Invalid stock roster response")
        for row in rows:
            ticker = str(row.get("ticker", "")).strip().upper()
            if TICKER.fullmatch(ticker):
                tickers.add(ticker)
        if len(rows) < 1000:
            break
        offset += len(rows)
        if offset >= 100_000:
            raise RuntimeError("ORCA roster exceeded 100,000 entries; revise batch architecture")
    return sorted(tickers)

def assigned_tickers(tickers=None):
    """All current registered tickers, processed in rotating daily batches if large."""
    tickers = registered_tickers() if tickers is None else sorted(set(tickers))
    override = os.getenv("ORCA_TICKERS", "").strip()
    if override:
        requested = {t.strip().upper() for t in override.split(",") if t.strip()}
        # Never allow explicit overrides to import a ticker outside ORCA's registry.
        tickers = [t for t in tickers if t in requested]
    size = max(1, min(MAX_BATCH, int(os.getenv("ORCA_BATCH_SIZE", str(MAX_BATCH)))))
    groups = [tickers[i:i + size] for i in range(0, len(tickers), size)]
    if not groups:
        return []
    group_index = date.today().toordinal() % len(groups)
    chosen = groups[group_index]
    print(f"ORCA stock registry: {len(tickers)} registered; batch {group_index+1}/{len(groups)}; {len(chosen)} to check")
    if len(groups) > 30:
        print("WARNING: more than 30 batches; increase workflow frequency before promising monthly freshness")
    return chosen
