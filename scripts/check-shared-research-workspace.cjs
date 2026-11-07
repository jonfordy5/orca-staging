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
check('Living Timeline renders all sourced milestones in chronological order without a fixed card count', () =>
  timeline.includes('const nextData=verified;') &&
  !timeline.includes('const milestoneTarget=') &&
  timeline.includes('allVerified=verified') &&
  timeline.includes("sb.from('orca_timeline_annotations')") &&
  timeline.includes("validSource(x.source_url)") &&
  timeline.includes(".is('created_by',null)"));
check('Milestone popup supports meaningful short briefs and source links', () =>
  timeline.includes('const hasBrief=') &&
  timeline.includes("const points=document.createElement('ul')") &&
  timeline.includes("const takeaway=document.createElement('p')") &&
  timeline.includes("link.href=event.source_url"));
check('TradingView remains fully visible above an independent timeline', () =>
  timeline.includes("mountLivingTimeline({sb,") &&
  timeline.includes("document.getElementById('timeline-frame')") &&
  timeline.includes('host.append(frame)') &&
  !timeline.includes("switchTo('tradingview')") &&
  !timeline.includes('tvBackup') &&
  workspace.includes('id="chart-frame"') &&
  workspace.includes('id="timeline-frame"') &&
  !workspace.includes('id="living-tradingview"') &&
  !workspace.includes('id="living-show"') &&
  workspace.includes('createMarketChart();createMarketQuote()'));
check('Zigzag desktop anchors every photo card to a peak', () =>
  timeline.includes("path.setAttribute('points','0,92 120,10 240,92')") &&
  timeline.includes("stop.append(zigzag,stem,dot,card)") &&
  workspace.includes('.orca-timeline-frame .orca-history-zigzag') &&
  workspace.includes('.orca-timeline-frame .orca-history-stop .orca-history-stem') &&
  workspace.includes('height:360px') &&
  workspace.includes('top:79px!important'));

check('Mobile history is a swipeable photo carousel without any line', () =>
  timeline.includes("window.matchMedia('(max-width:700px)').matches") &&
  workspace.includes('touch-action:pan-x!important') &&
  workspace.includes('scroll-snap-type:x mandatory!important') &&
  workspace.includes('.orca-timeline-frame .orca-history-zigzag,') &&
  workspace.includes('height:245px') &&
  workspace.includes('display:none!important'));

check('Company timelines remain open-ended with sourced history and credited photographs', () =>
  timeline.includes('const nextData=verified;') &&
  timeline.includes("link.href=event.source_url") &&
  timeline.includes("checkHistoryPermission();") &&
  timeline.includes("orca-timeline-photos.js?v="));

check('Illustrative photos come from separately cached metadata URLs', () =>
  photos.includes("sb.from('orca_timeline_photo_selections')") &&
  photos.includes("img.src=p.image_url") &&
  photos.includes('photographer_url') &&
  !photos.includes('data:image/'));
check('Photo controls hide when complete and remain available for missing or weak photos', () =>
  photos.includes('button.hidden=!needsAction') &&
  photos.includes("button.textContent=duplicateCount>0?'Improve photos':'Find photos'") &&
  photos.includes('visiblePhotos.filter(p=>p.needs_review)') &&
  photos.includes('visibleCards.filter(card=>!photos.has(card.dataset.eventId))'));
check('Open-ended photo coverage never repeats an old saved image', () =>
  photos.includes('seen.has(p.photo_id)') &&
  photos.includes('seen.add(p.photo_id)') &&
  photos.includes('if(!fallback)continue;') &&
  photos.includes("photos.set(card.dataset.eventId,{...fallback,temporary:true})") &&
  photos.includes("sb.from('orca_timeline_photo_selections')"));
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
  photos.includes(".eq('ticker',ticker).range(offset,offset+249)") &&
  !photos.includes('const {data:shared') &&
  !photos.includes('const {data:library}') );
check('Photo generation rejects negative relevance and never borrows other tickers', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('if(score<0&&!context_kinds.length&&!retail_illustration)return null;') &&
   engine.includes('if(duplicated){failed++;continue}') &&
   !engine.includes('const {data:library}');
});
check('Open-ended histories provide opt-in founding and current-year refreshes', () =>
  timeline.includes("scope==='current'?'Research '+year()+' milestone'") &&
  timeline.includes("scope==='origin'?'Research company beginnings'") &&
  timeline.includes('const nextData=verified;') &&
  timeline.includes('halfYearStart') &&
  timeline.includes('attemptedScopesThisSession') &&
  timeline.includes('await checkHistoryPermission();') &&
  !timeline.includes('if(!data.length)await maybePopulateCompanyHistory()') &&
  timeline.includes('refresh_eligible_after') &&
  timeline.includes('frame.insertBefore(generate,rail)') &&
  timeline.includes("frame.querySelector('.orca-history-refill-action')?.remove()"));
const discovery=read('supabase/functions/orca-timeline-discovery/index.ts');
check('Timeline discovery covers historical company origins with capped primary-source research', () =>
  discovery.includes("FULL HISTORY") &&
  discovery.includes('Date.parse("1800-01-01")') &&
  discovery.includes('max_tool_calls:targeted?1:5,max_output_tokens:targeted?2100:6500') &&
  discovery.includes('if(cost>.15)') &&
  discovery.includes('scope==="current"') &&
  discovery.includes('scope==="origin"') &&
  discovery.includes('remainingAtStart') &&
  discovery.includes('if(cost>.15)') &&
  discovery.includes('refresh_eligible_after:reservation?.refresh_eligible_after||null'));
const retrySql=read('sql/orca_timeline_immediate_targeted_completion.sql');
check('Immediate one-time targeted completion retains spending, authorization and throttle controls', () =>
  retrySql.includes('v_recent_count IN (8,9)') &&
  retrySql.includes('v_targeted_attempt_at IS NOT NULL') &&
  retrySql.includes("v_targeted_attempt_at+interval '24 hours'") &&
  retrySql.includes("v_recent_count NOT IN (8,9)") &&
  retrySql.includes('is_targeted_completion') &&
  retrySql.includes('v_user_recent>=10') &&
  retrySql.includes('IF v_used+0.15>15') &&
  retrySql.includes('p.opted_in IS TRUE') &&
  retrySql.includes('pg_advisory_xact_lock') &&
  retrySql.includes("state='failed'") &&
  retrySql.includes('REVOKE')===false &&
  timeline.includes('attemptedScopesThisSession') &&
  timeline.includes('generate.disabled=!mayRequestHistory()'));
const updatesSql=read('sql/orca_timeline_open_ended_periodic_updates.sql');
check('Semiannual update gate is shared and preserves cost and consent protections', () =>
  updatesSql.includes("v_scope NOT IN ('origin','current')") &&
  updatesSql.includes("reason','current_half_year_covered'") &&
  updatesSql.includes("reason','scope_retry_limit'") &&
  updatesSql.includes("v_used+0.15>15") &&
  updatesSql.includes('p.opted_in IS TRUE') &&
  updatesSql.includes('v_recent_user>=10') &&
  updatesSql.includes("GRANT EXECUTE ON FUNCTION public.orca_timeline_reserve_scoped_generation") &&
  updatesSql.includes('pg_advisory_xact_lock'));
check('Cached timelines check research consent on load without starting paid generation', () =>
  timeline.includes('await loadEvents();') &&
  timeline.includes('await checkHistoryPermission();') &&
  timeline.includes("canContribute:()=>historyAuthorized") &&
  !timeline.includes('if(!data.length)await maybePopulateCompanyHistory()'));
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
  engine.includes('strategy_version:10,needs_review:false') &&
  engine.includes('duplicateEvents.has(e.id)') &&
  engine.includes('function eventContextMatch(');
});
check('Ford searches by brand and refuses repeated database images', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('if(profile.brand==="ford")return [') &&
  engine.includes('F:"ford"') &&
  engine.includes('if(duplicated){failed++;continue}') &&
  engine.includes('const maximumPerCall=15;') &&
  !engine.includes('const lastResort=');
});
check('Dollar General photo queries distinguish groceries, leadership, listing and Mexico expansion', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return ['mexico grocery supermarket','meeting boardroom',
  'new york stock exchange','grocery supermarket refrigerated','convenience store'].every(term=>engine.includes(term)) &&
  engine.includes('const cash=') &&
  engine.includes('const competitor=');
});
check('Old flagged illustrations cannot be recycled as vetted company fallback', () => {
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return !engine.includes('const lastResort=') &&
  engine.includes('if(duplicated){failed++;continue}') &&
  !engine.includes('const {data:library}');
});
check('Photo repair remains available without the Unsplash diagnostic button', () =>
  !photos.includes('Check Unsplash API') &&
  !photos.includes('diagnosticsButton') &&
  !photos.includes('diagnostic:true') &&
  photos.includes("button.addEventListener('click',()=>void fillPhotos())") &&
  photos.includes('autoRepairAttempted') &&
  photos.includes('sessionStorage.setItem(key,String(Date.now()))') &&
  photos.includes('await refreshAndMaybeFill()'));

console.log('\nShared workspace checks: ' + passed + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
