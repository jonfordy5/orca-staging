/*
 * ORCA staging — shared stock workspace contract
 * All ticker workspaces use ONE HTML page. A failure in this test blocks
 * the GitHub consistency check; it never touches Supabase or research data.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workspace = read('research-workspace.html');
const redirect = read('research-workspace-staging.html');
const search = read('orca-stock-search.js');
const company = read('orca-company-profile.js');
const auto = read('orca-auto-company-profile.js');
const timeline = read('orca-living-timeline.js');
const photos = read('orca-timeline-photos.js');
const pageStandard = read('docs/orca-company-page-standard.md');
const failures = [];
let passed = 0;
function check(name, test) {
  try {
    assert.ok(test(), name);
    console.log('PASS ' + name);
    passed++;
  } catch (error) {
    failures.push(name);
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
check('One dynamic workspace handles every stock ticker', () =>
  workspace.includes("new URLSearchParams(location.search).get('ticker')"));
check('Search routes all tickers through shared workspace', () =>
  search.includes("orcaStagingHref('./research-workspace-staging.html',{ticker})") &&
  search.includes('window.location.assign(href(selected.ticker))'));
check('Staging alias forwards the ticker to canonical workspace', () =>
  redirect.includes("new URL('./research-workspace.html'") &&
  redirect.includes("target.searchParams.set('ticker', ticker)"));
check('Company profiles use one shared renderer, including RKLB', () =>
  company.includes('RKLB:Object.freeze') &&
  company.includes('renderUnifiedCompanyProfile(root,ticker,{') &&
  auto.includes('export function renderUnifiedCompanyProfile(') &&
  auto.includes('renderUnifiedCompanyProfile(root,ticker,{'));
check('Shared research panels are present exactly once', () =>
  ['execution','pricing','positioning'].every(key =>
    (workspace.match(new RegExp('id="investor-answer-' + key + '"','g')) || []).length === 1));
const elementIds = new Set([...workspace.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
check('No reference to a deleted literal DOM element ($)', () =>
  [...workspace.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].every(m => elementIds.has(m[1])));
check('Universal claim/research/publish form elements exist', () =>
  ['research-metric','request-assignment','research-question','research-answer',
    'summary','sources','publish','myclaim','collective-findings'].every(id => elementIds.has(id)));
const categories = workspace.slice(workspace.indexOf('const researchCategories=['),
  workspace.indexOf('const approvedMetrics='));
const metrics = [...categories.matchAll(/\{key:'([^']+)',area:'([^']+)'/g)].map(m => m[1]);
const catalog = ['sec.filings_catalysts','fundamentals.valuation','volume.relative',
  'volume.options','technical.technical_analysis','news.market_sentiment'];
check('All six approved research metrics appear exactly once', () =>
  metrics.length === catalog.length && catalog.every(k => metrics.filter(x => x === k).length === 1));
check('Research assignments always filter by selected ticker', () =>
  /from\('research_tasks'\).*?\.eq\('ticker',ticker\)/s.test(workspace));
check('Published findings always filter by selected ticker', () =>
  /from\('commons_research_findings'\).*?\.eq\('ticker',ticker\)/s.test(workspace));
check('Staging stock registration uses the selected ticker', () =>
  search.includes('JSON.stringify({ticker:selected.ticker})'));
check('All profiles share the same mission/method and company size headings', () =>
  auto.includes("'The mission and the method'") &&
  auto.includes("'Company size and impact'"));

check('All tickers mount the same source-backed Living Timeline component', () =>
  workspace.includes("mountLivingTimeline({sb,ticker,") &&
  workspace.includes("import('./orca-living-timeline.js?"));
check('Living Timeline features ten milestones without removing archived events', () =>
  timeline.includes('const milestoneTarget=10') &&
  timeline.includes('data=verified.length<=milestoneTarget?verified:Array.from(') &&
  timeline.includes("sb.from('orca_timeline_annotations')") &&
  timeline.includes("validSource(x.source_url)") &&
  timeline.includes(".is('created_by',null)"));
check('Milestone popup supports meaningful short briefs and source links', () =>
  timeline.includes('const hasBrief=') &&
  timeline.includes("const points=document.createElement('ul')") &&
  timeline.includes("const takeaway=document.createElement('p')") &&
  timeline.includes("link.href=event.source_url"));
check('Historical source data stays independent of the TradingView chart', () =>
  timeline.includes("mountLivingTimeline({sb,") &&
  timeline.includes("switchTo('tradingview')") &&
  workspace.includes("id=\"living-tradingview\""));
check('Illustrative photos come from separately cached metadata URLs', () =>
  photos.includes("sb.from('orca_timeline_photo_selections')") &&
  photos.includes("img.src=p.image_url") &&
  photos.includes('photographer_url') &&
  !photos.includes('data:image/'));
check('Photo controls vanish when complete but remain available for missing or weak photos', () =>
  photos.includes('button.hidden=!needsAction') &&
  photos.includes("button.textContent=duplicateCount>0?'Improve photos':'Find photos'") &&
  photos.includes('visiblePhotos.filter(p=>p.needs_review)') &&
  photos.includes('visibleCards.filter(card=>!rawPhotos.has(card.dataset.eventId))') &&
  photos.includes('filter(p=>!p.needs_review)'));
check('Photo status is hidden visually but research navigation remains accessible', () =>
  timeline.includes("index.className='orca-timeline-index'") &&
  timeline.includes("index.setAttribute('aria-live','polite')") &&
  workspace.includes('.orca-timeline-navigation .orca-timeline-index'));
check('Universal page standard is documented without a hard metadata cap', () =>
  pageStandard.includes('existing and future stock ticker') &&
  pageStandard.includes('not a hard 20 KiB ceiling') &&
  pageStandard.includes('Never overwrite archived findings'));

check('Empty registered timelines explain consent and offer a generate action', () =>
  timeline.includes("empty.textContent='No sourced company milestones cached") &&
  timeline.includes("generate.textContent='Generate company history'") &&
  timeline.includes("generate.addEventListener('click',()=>void maybePopulateCompanyHistory())"));
check('Timeline generation checks opted-in researcher without requiring stock membership in UI', () =>
  timeline.includes("async function checkHistoryPermission()") &&
  timeline.includes(".eq('owner_id',user.id).eq('opted_in',true)") &&
  timeline.includes("canContribute:()=>historyAuthorized") &&
  timeline.includes('discoveryPending=true'));
console.log('\nShared workspace checks: ' + passed + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
