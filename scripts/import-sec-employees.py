#!/usr/bin/env python3
"""Import conservatively extracted, dated employee headcounts from SEC 10-Ks.

Runs independently after the existing revenue importer. Reads official filing text,
updates ONLY the employees field, and refuses ambiguous/outdated figures.
No third-party dependencies. SEC requests are spaced to respect fair access.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from html.parser import HTMLParser

BASE = 'https://vbziibatnejoswsdggga.supabase.co'
CONTACT = os.environ.get('SEC_USER_AGENT', '').strip()
KEY = os.environ.get('SUPABASE_SECRET_KEY', '').strip()
from orca_registered_tickers import assigned_tickers

MAX_FILING_BYTES = 15_000_000
MONTH = r'(?:January|February|March|April|May|June|July|August|September|October|November|December)'
DATE = re.compile(r'\b(?:as\s+of|at|on)\s+((?:' + MONTH + r')\s+\d{1,2},?\s+20\d{2})\b', re.I)
FISCAL_DATE = re.compile(r'\b(?:as\s+of|at)\s+(?:the\s+)?(?:end\s+of\s+)?(?:our\s+)?(?:fiscal\s+year|fiscal\s+FY|FY)\s*(20\d{2})\b', re.I)
NUMBER = r'(?P<n>\d{1,3}(?:,\d{3})+|\d{4,7}|\d+(?:\.\d+)?\s+(?:million|thousand))'
PERSON = r'(?:(?:full[- ]time(?:\s+(?:and|or)\s+part[- ]time)?|part[- ]time\s+and\s+full[- ]time|full[- ]time\s+equivalent)\s+)?(?:employees|associates|people|team\s+members|workers)'
HEADCOUNT = re.compile(
    r'\b(?:we|the\s+company|our\s+company|our\s+business|the\s+group)\s+'
    r'(?:had|have|employed|employ|employs)\s+'
    r'(?:(?:a\s+total\s+of|approximately|about|around|roughly|nearly)\s+){0,3}'
    + NUMBER + r'\s+' + PERSON + r'\b', re.I)
HEADCOUNT_WITH = re.compile(
    r'\b(?:with|having)\s+(?:(?:approximately|about|around|roughly|nearly)\s+)?'
    + NUMBER + r'\s+' + PERSON + r'\b', re.I)
HEADCOUNT_REVERSED = re.compile(
    r'\b(?:(?:our|the)\s+)?(?:total\s+)?(?:worldwide\s+|global\s+)?'
    r'(?:employee\s+count|headcount|workforce|number\s+of\s+employees)\s+'
    r'(?:was|were|totaled|stood\s+at|of)\s+'
    r'(?:(?:approximately|about|around|roughly)\s+)?' + NUMBER + r'\b', re.I)

class FilingText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.bits = []
        self.skipped = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'head'):
            self.skipped += 1
        elif not self.skipped and tag in ('div', 'p', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4'):
            self.bits.append(' ')
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'head'):
            self.skipped = max(0, self.skipped-1)
        elif not self.skipped and tag in ('div', 'p', 'br', 'li', 'tr'):
            self.bits.append(' ')
    def handle_data(self, data):
        if not self.skipped: self.bits.append(data)
    def output(self):
        return re.sub(r'\s+', ' ', html.unescape(' '.join(self.bits)))

def number(raw):
    val = raw.lower().replace(',', '').strip()
    parts = val.split()
    if len(parts) == 2 and parts[1] in ('million', 'thousand'):
        return round(float(parts[0]) * (1_000_000 if parts[1]=='million' else 1_000))
    return int(val)

def parse_date(raw):
    clean = re.sub(r'\s+', ' ', raw.replace(',', ' '))
    return datetime.strptime(clean, '%B %d %Y').date()

def find_headcount(text, report_date):
    """Return headcount only when a dated total-workforce statement is unambiguous."""
    report = date.fromisoformat(report_date)
    # Focus on Item 1 / human capital; avoid later notes and exhibits.
    text = re.sub(r'\s+', ' ', text)[:2_000_000]
    candidates=[]
    for pattern in (HEADCOUNT, HEADCOUNT_REVERSED, HEADCOUNT_WITH):
        for m in pattern.finditer(text):
            value = number(m.group('n'))
            if not 100 <= value <= 10_000_000: continue
            before = text[max(0,m.start()-250):m.start()]
            after = text[m.end():m.end()+230]
            nearby = [(parse_date(d.group(1)), 'before') for d in DATE.finditer(before)]
            nearby += [(parse_date(d.group(1)), 'after') for d in DATE.finditer(after)]
            if not nearby:
                fiscal=FISCAL_DATE.search(before) or FISCAL_DATE.search(after)
                if fiscal and int(fiscal.group(1))==report.year:
                    nearby=[(report,'fiscal-year-end')]
            if not nearby: continue
            observed = min(nearby,key=lambda p:abs((p[0]-report).days))[0]
            if abs((observed-report).days)>120: continue
            context = text[max(0,m.start()-80):m.end()+65].lower()
            tail = text[m.end():m.end()+65].lower()
            if re.search(r'^\s+(?:in|across|from)\s+(?:the\s+)?(?:u\.?s\.?|united states|canada|europe|asia|china|india)\b', tail): continue
            if any(word in context for word in ('contractors and', 'temporary personnel', 'franchisee employees', 'employees of our franchisees')):
                continue
            candidates.append((value,observed.isoformat(),m.group(0)))
    distinct={(v,d) for v,d,_ in candidates}
    if len(distinct)!=1:return None
    value,asof=next(iter(distinct))
    return {'value':value,'year':int(asof[:4]),'as_of':asof,
            'reporting_period':report_date,'method':'10k_text_verified_date'}

def request(url, *, method='GET', body=None):
    headers={'User-Agent':CONTACT,'Accept':'application/json' if url.startswith(BASE) or '/submissions/' in url or 'company_tickers.json' in url else 'text/html'}
    if url.startswith(BASE):headers={'apikey':KEY,'Accept':'application/json','Content-Type':'application/json'}
    req=urllib.request.Request(url,data=body,method=method,headers=headers)
    with urllib.request.urlopen(req,timeout=22) as response:
        data=response.read(MAX_FILING_BYTES+1)
        if len(data)>MAX_FILING_BYTES:raise ValueError('filing_too_large')
        return data

def latest_10k(cik):
    filing=json.loads(request('https://data.sec.gov/submissions/CIK'+cik+'.json'))
    recent=filing.get('filings',{}).get('recent',{})
    for idx,form in enumerate(recent.get('form',[])):
        if form!='10-K':continue
        period=recent['reportDate'][idx]
        if not re.fullmatch(r'20\d{2}-\d{2}-\d{2}',period):continue
        if (date.today()-date.fromisoformat(period)).days>550:continue
        accn=recent['accessionNumber'][idx].replace('-','')
        doc=recent['primaryDocument'][idx]
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.html?',doc):continue
        link='https://www.sec.gov/Archives/edgar/data/'+str(int(cik))+'/'+accn+'/'+doc
        return period,link
    return None

def get_saved(ticker):
    url=BASE+'/rest/v1/orca_company_official_metrics?'+urllib.parse.urlencode({'ticker':'eq.'+ticker,'select':'employees'})
    rows=json.loads(request(url))
    return rows[0]['employees'] if rows else None

def put_employee(ticker,entry):
    url=BASE+'/rest/v1/orca_company_official_metrics?ticker=eq.'+ticker
    request(url,method='PATCH',body=json.dumps({'employees':entry}).encode('utf-8'))

def run():
    tickers=assigned_tickers()
    if '@' not in CONTACT or not KEY.startswith('sb_secret_') or not tickers:
        raise SystemExit('SEC_USER_AGENT, SUPABASE_SECRET_KEY and ORCA_TICKERS required')
    directory=json.loads(request('https://www.sec.gov/files/company_tickers.json'))
    by_ticker={str(r.get('ticker','')).upper():r for r in directory.values()}
    updated=0; unmatched=0; failures=[]
    for ticker in tickers:
        if not re.fullmatch(r'[A-Z][A-Z0-9.]{0,9}',ticker):continue
        company=by_ticker.get(ticker)
        if not company:
            print(ticker+': SEC ticker unavailable');unmatched+=1;continue
        try:
            cik=str(company['cik_str']).zfill(10)
            filing=latest_10k(cik)
            if not filing:
                print(ticker+': no current 10-K HTML');unmatched+=1;continue
            period,link=filing
            parser=FilingText()
            parser.feed(request(link).decode('utf-8','replace'))
            found=find_headcount(parser.output(),period)
            if not found:
                print(ticker+': no unambiguous dated headcount in 10-K');unmatched+=1;continue
            found['source']=link
            saved=get_saved(ticker)
            if saved and (
                (saved.get('as_of') and str(saved['as_of']) >= found['as_of']) or
                (not saved.get('as_of') and int(saved.get('year') or 0) >= found['year'])
            ):
                print(ticker+': existing headcount is as recent or newer');continue
            put_employee(ticker,found)
            print(ticker+': saved '+str(found['value'])+' employees as of '+found['as_of'])
            updated+=1
        except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError,KeyError,IndexError) as exc:
            failures.append(ticker)
            print(ticker+': fetch/parse/write issue '+str(exc)[:100])
        time.sleep(0.6)
    print('Employee import: '+str(updated)+' updated; '+str(unmatched)+' without qualified headcount; '+str(len(failures))+' errors')
    if failures:print('Employee import errors: '+','.join(failures))
    if failures and updated == 0 and len(failures) >= max(3, len(tickers)//2):
        raise SystemExit('Employee filing collection failed for most tickers; check SEC access')

if __name__=='__main__':run()
