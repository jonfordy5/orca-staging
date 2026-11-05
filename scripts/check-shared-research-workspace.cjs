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
  timeline.includes('const nextData=verified.length<=milestoneTarget?verified:Array.from(') &&
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
check('Photo controls hide when complete and remain available for missing or weak photos', () =>
  photos.includes('button.hidden=!needsAction') &&
  photos.includes("button.textContent=duplicateCount>0?'Improve photos':'Find photos'") &&
  photos.includes('visiblePhotos.filter(p=>p.needs_review)') &&
  photos.includes('visibleCards.filter(card=>!rawPhotos.has(card.dataset.eventId))'));
check('Ten-card photo coverage reuses credited images before ever showing white cards', () =>
  photos.includes('const fallbackPool=') || (
    photos.includes('let fallbackPool=') &&
    photos.includes("photos.set(card.dataset.eventId,{...fallback,temporary:true})") &&
    photos.includes("sb.from('orca_timeline_photo_selections')") &&
    photos.includes('void fillPhotos()')
  ));
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
check('Every timeline photo stays scoped to the same stock ticker', () =>
  photos.includes(".eq('ticker',ticker).limit(500)") &&
  !photos.includes('const {data:shared') &&
  !photos.includes('const {data:library}') );
check('Photo generation rejects negative relevance and never borrows other tickers', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('if(score<0&&!context_kinds.length)return null;') &&
   engine.includes('const backups=stockCache||[];') &&
   !engine.includes('const {data:library}');
});
check('Cached ten-milestone timelines can authorize their first photo generation', () =>
  timeline.includes('await checkHistoryPermission();await maybePopulateCompanyHistory();'));
check('Ambiguous multiword brands remain intact, including Dollar General', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('DG:"dollar general"') &&
  engine.includes('.trim().toLowerCase();') &&
  engine.includes('theme:"discount retail"') &&
  engine.includes('profile.brand+" discount store"') &&
  engine.includes('if(profile.theme==="discount retail")') &&
  engine.includes('const cash=') &&
  engine.includes('const competitor=');
});

check('Milestone photo matching uses event-aware visual plans', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('function eventVisualPlan(') &&
  engine.includes('function eventCandidateScore(') &&
  engine.includes('eventVisualPlan(e,profile)') &&
  engine.includes('visualQueries(profile,featured)') &&
  engine.includes('strategy_version:8,needs_review:duplicated') &&
  engine.includes('duplicateEvents.has(e.id)') &&
  engine.includes('function eventContextMatch(');
});
check('Dollar General photo queries distinguish groceries, leadership, listing and Mexico expansion', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return ['mexico grocery supermarket interior','business meeting boardroom',
  'new york stock exchange building','grocery supermarket refrigerated section'].every(term=>engine.includes(term)) &&
  engine.includes('const cash=') &&
  engine.includes('const competitor=');
});
check('Old flagged illustrations cannot be recycled as vetted company fallback', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('if(p.needs_review||!p.photo_id') &&
  engine.includes('.eq("ticker",ticker).limit(100)') &&
  !engine.includes('const {data:library}');
});
check('Photo-fill retries when permissions resolve and newly researched milestones render', () =>
  photos.includes('lastAutoFillSignature!==signature') &&
  photos.includes('getUser()&&canContribute()') &&
  photos.includes('void fillPhotos()'));

console.log('\nShared workspace checks: ' + passed + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
