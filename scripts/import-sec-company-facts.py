#!/usr/bin/env python3
"""ORCA staging: scheduled SEC Company Facts import into Supabase.
Required GitHub Actions secrets: SEC_USER_AGENT (real organization + contact email),
SUPABASE_SECRET_KEY (server-only credential). Never put secrets in client code.
Fetch only registered ticker symbols passed via ORCA_TICKERS; validate data dates.
"""
import json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
BASE="https://vbziibatnejoswsdggga.supabase.co"
AGENT=os.environ.get("SEC_USER_AGENT","").strip()
KEY=os.environ.get("SUPABASE_SECRET_KEY","").strip()
from orca_registered_tickers import assigned_tickers
TICKERS=assigned_tickers()
if not AGENT or "@" not in AGENT or not KEY or not TICKERS:
    sys.exit("SEC_USER_AGENT, SUPABASE_SECRET_KEY and ORCA_TICKERS required; no writes performed")
def fetch(url):
    request=urllib.request.Request(url,headers={"User-Agent":AGENT,"Accept":"application/json"})
    with urllib.request.urlopen(request,timeout=18) as r:return json.load(r)
def recent(f):
    if f.get("form")!="10-K" or f.get("fp")!="FY" or not f.get("filed"):return False
    return bool(re.fullmatch(r"20\d\d-\d\d-\d\d",f.get("end","")))
def metric(doc,names,unit,annual):
    values=[]
    for name in names:
        for f in doc.get("facts",{}).get("us-gaap" if annual else "dei",{}).get(name,{}).get("units",{}).get(unit,[]):
            if not recent(f) or not isinstance(f.get("val"),(int,float)) or f["val"]<=0:continue
            if annual:
                if not f.get("start"):continue
                days=(datetime.fromisoformat(f["end"])-datetime.fromisoformat(f["start"])).days
                if not 330<=days<=395:continue
            values.append(f)
    values.sort(key=lambda f:(f["end"],f["filed"]),reverse=True)
    if not values:return None
    f=values[0]
    if datetime.fromisoformat(f["end"]).year<datetime.now(timezone.utc).year-1:return None
    cik=str(doc["cik"])
    path=f.get("accn","").replace("-","")
    link=f"https://www.sec.gov/Archives/edgar/data/{cik}/{path}/" if path else f"https://www.sec.gov/edgar/browse/?CIK={cik}"
    result={"value":round(f["val"]) if not annual else f["val"],"year":int(f["fy"]),"as_of":f["end"],"source":link,"filed":f["filed"]}
    if annual:result["currency"]="USD"
    return result
def choose_newer(saved, candidate):
    # If the filing has no figure, keep the existing one.
    if candidate is None: return saved
    if saved is None: return candidate
    def period(m): return str(m.get("as_of") or (str(m.get("year", 0)) + "-01-01"))
    return candidate if period(candidate) >= period(saved) else saved

def save(ticker,reven,employees):
    lookup=BASE+"/rest/v1/orca_company_official_metrics?ticker=eq."+ticker+"&select=revenue,employees"
    request=urllib.request.Request(lookup,headers={"apikey":KEY,"Accept":"application/json"})
    with urllib.request.urlopen(request,timeout=20) as response:
        records=json.load(response)
    saved=records[0] if records else {}
    reven=choose_newer(saved.get("revenue"),reven)
    employees=choose_newer(saved.get("employees"),employees)
    body=json.dumps({"ticker":ticker,"revenue":reven,"employees":employees,"source_class":"sec_annual","fetched_at":datetime.now(timezone.utc).isoformat(),"last_error":None}).encode()
    req=urllib.request.Request(BASE+"/rest/v1/orca_company_official_metrics?on_conflict=ticker",data=body,method="POST",headers={"apikey":KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req,timeout=20) as response:
        if response.status not in (200,201,204):raise RuntimeError("database write unsuccessful")
directory=fetch("https://www.sec.gov/files/company_tickers.json")
by_ticker={row.get("ticker","").upper():row for row in directory.values()}
errors=[]
for raw in TICKERS:
    ticker=raw.strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9.]{0,9}",ticker):continue
    info=by_ticker.get(ticker)
    if not info:
        print(ticker,": not found in SEC directory");continue
    try:
        cik=str(info["cik_str"]).zfill(10)
        doc=fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json")
        if int(doc.get("cik",0))!=int(info["cik_str"]):raise ValueError("CIK mismatch")
        revenue=metric(doc,["RevenueFromContractWithCustomerExcludingAssessedTax","RevenueFromContractWithCustomerIncludingAssessedTax","SalesRevenueNet","Revenues"],"USD",True)
        employees=metric(doc,["EntityNumberOfEmployees"],"pure",False)
        if not revenue and not employees:
            print(ticker,": no applicable recent facts; existing record untouched")
        else:
            save(ticker,revenue,employees)
            print(ticker,": saved",bool(revenue),"revenue",bool(employees),"employees")
    except (urllib.error.URLError,ValueError,RuntimeError,KeyError,TypeError) as exc:
        print(ticker,": error",str(exc)[:160]);errors.append(ticker)
    time.sleep(0.5)
if errors:sys.exit("Failed tickers: "+",".join(errors))
