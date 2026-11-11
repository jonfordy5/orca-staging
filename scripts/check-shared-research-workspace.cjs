/*
 * ORCA staging — shared stock workspace contract
 * All ticker workspaces use ONE HTML page. A failure in this test blocks
 * the GitHub consistency check; it never touches Supabase or research data.
 */
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
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
check('Timeline modules parse as JavaScript before publication', () => {
 for(const file of ['orca-living-timeline.js','orca-timeline-photos.js']){
  execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe',timeout:5000});
 }
 return true;
});
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
check('Approved realm portraits remain original, uncropped and integrated with findings', () => {
 const {createHash}=require('node:crypto');
 const realms=[
  ['management',"The King's Keep",'Management','execution','f67d169c28506be9fff319ef45e719da543dae088e110203e6ea5e1ed7c04f47'],
  ['earnings','The Vault','Earnings','pricing','9d6448459ffe3e6581293993c1ef9a845b9b5a6342f2123230bc61dcdefe5728'],
  ['positioning','The Frontier','Positioning','positioning','81bba89a1d8f011fd451e52b20720145a6de2afe5a5e867d7c8016d87fd3487f']
 ];
 assert.equal((workspace.match(/class="orca-realm-art"/g)||[]).length,3);
 for(const [key,title,category,answer,hash] of realms){
  const file='assets/orca-world-'+key+'.webp';
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash);
  assert.ok(workspace.includes('data-realm="'+key+'"><img src="./'+file+'?v=full-portrait-v2"'));
  assert.ok(workspace.includes('<h3 class="pillar-heading">'+title+'</h3><p class="orca-realm-subtitle">'+category+'</p></div></div><div id="investor-answer-'+answer+'"'));
 }
 return workspace.includes('.investor-question .orca-realm-art{aspect-ratio:3/4;') &&
  /\.investor-question \.orca-realm-art img\{[^}]*object-fit:contain/.test(workspace) &&
  /\.investor-question \.orca-realm-label\{[^}]*bottom:0/.test(workspace);
});
check('Both external market widgets use dark themes and retain provider and delay disclosures', () =>
 workspace.includes("theme:'dark'") && workspace.includes("colorTheme:'dark'") &&
 !workspace.includes("theme:'light'") && !workspace.includes("colorTheme:'light'") &&
 workspace.includes("support_host:'https://www.tradingview.com'") &&
 workspace.includes("a.textContent='Stock quote by TradingView'") &&
 workspace.includes('US stock quotes may be delayed. Quote and research outlook are independent; ORCA does not collect or score this price.'));
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

check('Company descriptions replace weak pronoun openings without changing internal pronouns', () => {
 const vm=require('node:vm');
 const start=auto.indexOf('export function polishCompanySentenceOpenings(');
 const end=auto.indexOf('// The ONE layout for every ORCA stock.',start);
 if(start<0||end<0)return false;
 const ctx={};
 vm.runInNewContext(auto.slice(start,end).replace('export function ','function ')+
  '\nglobalThis.polish=polishCompanySentenceOpenings;',ctx);
 const polish=ctx.polish;
 return polish('It sells products. It also offers AWS.','Amazon.com Inc. Common Stock','AMZN')===
    'Amazon sells products. Amazon also offers AWS.' &&
   polish('Its core focus is retail. Its brands are strong.','Ford Motor Company','F')===
    'Ford’s core focus is retail. Ford’s brands are strong.' &&
   polish('Amazon sells goods, and it supports merchants.','Amazon','AMZN')===
    'Amazon sells goods, and it supports merchants.' &&
   polish('It serves diners.','The Wendy’s Company','WEN')==='Wendy’s serves diners.';
});
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
check('Approved timeline design is locked in the universal stock-page standard', () =>
  pageStandard.includes('## Approved timeline design — locked baseline') &&
  pageStandard.includes('**Always-visible stacked charts:**') &&
  pageStandard.includes('**Direct connectors:**') &&
  pageStandard.includes('**Traveling light:**') &&
  pageStandard.includes('**Open-ended company history:**') &&
  pageStandard.includes('**Initial and subsequent navigation:**') &&
  pageStandard.includes('**Mobile (700px and narrower):**') &&
  pageStandard.includes('**Photo interface:**'));

check('Locked design keeps the current rendering unchanged', () =>
  workspace.includes('id="chart-frame"') &&
  workspace.includes('id="timeline-frame"') &&
  !workspace.includes('id="living-show"') &&
  !workspace.includes('id="living-tradingview"') &&
  workspace.includes('height:570px') &&
  workspace.includes('flex:0 0 210px') &&
  timeline.includes('stop.append(stem,card,year)') &&
  !timeline.includes("dot.className='orca-history-dot'") &&
  timeline.includes("spine.append(svg)") &&
  timeline.includes('const futureStep=190;') &&
  timeline.includes("const tailFadeStart=Math.max(0,futurePoints[1][0]-150)") &&
  timeline.includes("centerMilestone(card,'auto')") &&
  workspace.includes('touch-action:pan-x pan-y pinch-zoom!important') &&
  !photos.includes('Check Unsplash API') &&
  workspace.includes('.orca-company-timeline .orca-photo-context{display:none!important}'));

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
check('Timeline connects directly to card stems with no circle nodes', () =>
  timeline.includes("stop.querySelector('.orca-history-stem').getBoundingClientRect()") &&
  timeline.includes('i%2===0?rect.bottom:rect.top') &&
  timeline.includes('spine.append(svg)') &&
  !timeline.includes('spine.prepend(svg)') &&
  !timeline.includes("dot.className='orca-history-dot'") &&
  timeline.includes('stop.append(stem,card,year)') &&
  workspace.includes('top:182px!important;height:34px!important') &&
  workspace.includes('top:266px!important;height:26px!important') &&
  !workspace.includes('animation:orca-dot-arrival'));

check('Every event retains its own year label and clickable sourced photo', () =>
  timeline.includes("stop.append(stem,card,year)") &&
  !timeline.includes('yearLabelIndex') &&
  timeline.includes("card.addEventListener('click',()=>selectMilestone(i))") &&
  workspace.includes('top:187px!important') &&
  workspace.includes('top:277px!important'));

check('Timeline extends beyond the newest milestone and fades into the future', () =>
  timeline.includes('const futureStep=190;') &&
  timeline.includes('const futurePoints=[') &&
  timeline.includes('const entireLine=[...points,...futurePoints]') &&
  timeline.includes("const tailFadeStart=Math.max(0,futurePoints[1][0]-150)") &&
  timeline.includes("tailGradient.setAttribute('gradientUnits','userSpaceOnUse')") &&
  timeline.includes("base.setAttribute('mask','url(#'+tailId+')')") &&
  timeline.includes("beam.setAttribute('mask','url(#'+tailId+')')") &&
  timeline.includes('Math.max(420,Math.round') &&
  workspace.includes('v=mobile-carousel-v44'));

check('Open-ended timeline preserves milestones and beam arrival effects', () =>
  timeline.includes('const nodeDistances=[0]') &&
  timeline.includes('for(let i=1;i<points.length;i++)') &&
  timeline.includes('const length=base.getTotalLength()') &&
  timeline.includes("stops[i].classList.add('orca-history-activated')") &&
  !timeline.includes('futureStop') &&
  workspace.includes('animation:orca-photo-arrival 1.4s'));

check('A single tapered beam replaces the former two-tone segment', () =>
  timeline.includes("gradient.setAttribute('id',gradientId)") &&
  timeline.includes("beam.setAttribute('stroke','url(#'+gradientId+')')") &&
  timeline.includes("const beamLength=Math.min(115,Math.max(60,length*0.06))") &&
  workspace.includes('.orca-history-track-beam') &&
  !workspace.includes('.orca-history-track-glow{') &&
  !timeline.includes("makePath('orca-history-track-glow')"));

check('Beam touches milestone and lights connector up to the photo', () =>
  timeline.includes("nodeDistances[i]>previousHead&&nodeDistances[i]<=head") &&
  timeline.includes("stops[i].classList.add('orca-history-activated')") &&
  timeline.includes("e.animationName==='orca-photo-arrival'") &&
  workspace.includes('animation:orca-connector-arrival 1.4s') &&
  !workspace.includes('animation:orca-dot-arrival') &&
  workspace.includes('animation:orca-photo-arrival 1.4s') &&
  workspace.includes('prefers-reduced-motion:reduce'));

check('Desktop centers the middle milestone, mobile starts at the beginning, navigation remains intact', () =>
  timeline.includes('const middle=Math.floor((data.length-1)/2)') &&
  timeline.includes('const initialIndex=mobileLayout.matches?0:middle') &&
  timeline.includes("centerMilestone(card,'auto')") &&
  timeline.includes("prev.addEventListener('click',()=>jumpTo(0))") &&
  timeline.includes("next.addEventListener('click',()=>jumpTo(data.length-1))") &&
  workspace.includes('v=mobile-carousel-v44'));

check('Mobile history stays a swipe carousel without zigzag or glowing track', () =>
  workspace.includes('touch-action:pan-x pan-y pinch-zoom!important') &&
  workspace.includes('scroll-snap-type:x mandatory!important') &&
  workspace.includes('#chart-section .orca-timeline-frame .orca-history-track,') &&
  workspace.includes('flex:0 0 100%!important;width:100%!important') &&
  workspace.includes('--orca-mobile-card-height:clamp(260px,76vw,330px)') &&
  workspace.includes('position:relative!important;top:auto!important;bottom:auto!important;left:auto!important') &&
  workspace.includes('(max-height:600px) and (hover:none) and (pointer:coarse)') &&
  timeline.includes('Swipe to explore · ') &&
  workspace.includes('display:none!important'));

check('Company timelines remain open-ended with sourced history and credited photographs', () =>
  timeline.includes('const nextData=verified;') &&
  timeline.includes("link.href=event.source_url") &&
  timeline.includes("checkHistoryPermission();") &&
  timeline.includes("orca-timeline-photos.js?v="));

check('Real photos come from cached metadata while original fallback art is clearly labeled', () =>
  photos.includes("sb.from('orca_timeline_photo_selections')") &&
  photos.includes('img.src=p.image_url') &&
  photos.includes('photographer_url') &&
  photos.includes("return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)") &&
  photos.includes('renderIllustration(card)') &&
  photos.includes('Original abstract illustration; not a historical photograph'));
check('No separate photo button: the unified research action owns picture completion', () =>
  photos.includes('button.hidden=true') &&
  photos.includes('return {refresh,fillMissing,getCoverage};') &&
  photos.includes('visibleCards.filter(card=>!photos.has(card.dataset.eventId))') &&
  timeline.includes('photoMount.fillMissing({includeBrand:brandPhotoPending})') &&
  timeline.includes("const needed=completionStatusKnown&&(needsResearch()||needsPhotoWork())"));
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

check('Brand new stocks request full ten-event history, not a single origin event', () =>
  timeline.includes("const researchNeed=()=>!allVerified.length?'history':!hasCurrentYear()?'current':") &&
  timeline.includes("const initialHistoryGoal=10;") &&
  timeline.includes("showResearchFeedback(summaries.join(' ')") &&
  timeline.includes("researchFeedback&&!data.length") &&
  !timeline.includes('attemptedScopesThisSession'));
check('Empty registered timelines explain consent and offer a generate action', () =>
  timeline.includes("empty.textContent='No sourced company milestones cached") &&
  timeline.includes("generate.textContent='Complete company timeline'") &&
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
check('Photo generation checks licensed URLs and never borrows other tickers',()=>{
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('usedUrls.has(originalUrl(p.full_image_url))')&&engine.includes('.eq("ticker",ticker)')&&engine.includes('photo.premium||photo.plus');
});
check('Company incorporation founding milestone suppresses unnecessary paid origin searches', () => {
 const source=timeline.match(/const isOrigin=e=>[\s\S]*?;\n/);
 if(!source)return false;
 const expression=source[0].replace(/^const isOrigin=e=>/,'').replace(/;\n$/,'');
 const isOrigin=new Function('e','return '+expression);
 return isOrigin({title:'Intel incorporates to pursue continuous innovation'}) &&
  isOrigin({title:'The company was incorporated'}) &&
  !isOrigin({title:'Intel introduces a new chip'});
});
check('Meta Harvard founding is recognized and 2026 is handled within the first click', () => {
 const source=timeline.match(/const isOrigin=e=>[\s\S]*?;\n/);
 if(!source)return false;
 const isOrigin=new Function('e','return '+source[0].replace(/^const isOrigin=e=>/,'').replace(/;\n$/,''));
 return isOrigin({title:'Facebook launches at Harvard'}) &&
  timeline.includes("!hasCurrentYear()&&!attempted.has('current')") &&
  !timeline.includes("completionAttemptedThisView") &&
  timeline.includes("if(!needed||!getUser())") &&
  timeline.includes("if(code==='no_acceptable_primary_source_milestones'||code==='cost_envelope_exceeded')continue;") &&
  timeline.includes("if(photoMount&&allVerified.length)");
});
check('McDonald brothers opening the first restaurant counts as founding', () => {
 const source=timeline.match(/const isOrigin=e=>[\s\S]*?;\n/);
 if(!source)return false;
 const isOrigin=new Function('e','return '+source[0].replace(/^const isOrigin=e=>/,'').replace(/;\n$/,''));
 return isOrigin({title:'McDonald brothers open the first McDonald’s'}) &&
  isOrigin({title:'The company opens the first restaurant'}) &&
  !isOrigin({title:'McDonald’s opens in Moscow for the first time'});
});
check('Empty new stock boards cannot render two Complete timeline buttons', () =>
 timeline.includes('if(!data.length){\n   old?.remove();') &&
 timeline.includes("const emptyButton=rail.querySelector('.orca-timeline-generate')") &&
 timeline.includes('if(!old){') &&
 timeline.includes('frame.insertBefore(generate,rail)'));
check('Missing image records keep Complete timeline action available', () =>
 timeline.includes("const mayRequestHistory=()=>completionStatusKnown&&!discoveryPending&&(needsResearch()||needsPhotoWork())") &&
 timeline.includes('photoMissing=Math.max(0,Number(coverage?.missing||0))') &&
 photos.includes('return getCoverage();'));
check('Open-ended histories provide opt-in founding and current-year refreshes', () =>
  timeline.includes("generate.textContent='Complete company timeline'") &&
  timeline.includes("const nextScope=()=>!allVerified.length&&!historyAttempts&&!blockedScopes.history?'history':") &&
  timeline.includes('const nextData=verified;') &&
  timeline.includes('halfYearStart') &&
  !timeline.includes('attemptedScopesThisSession') &&
  timeline.includes('await checkHistoryPermission();') &&
  !timeline.includes('if(!data.length)await maybePopulateCompanyHistory()') &&
  timeline.includes("const maxBudget=0.15;") &&
  timeline.includes("if(!scope||(scope!=='history'&&attempted.has(scope)))break;") &&
  timeline.includes("body:{ticker,scope,max_budget_usd:stageBudget,final_history_pass:scope==='history'&&historyAttempts===2}") &&
  timeline.includes('frame.insertBefore(generate,rail)') &&
  timeline.includes("frame.querySelector('.orca-history-refill-action')?.remove()"));
const discovery=read('supabase/functions/orca-timeline-discovery/index.ts');
check('Timeline discovery covers historical company origins with capped primary-source research', () =>
  discovery.includes("FULL HISTORY") &&
  discovery.includes('Date.parse("1800-01-01")') &&
  discovery.includes('Math.min(targeted?2:5') && discovery.includes('max_output_tokens:targeted?Math.min(') &&
  discovery.includes('if(cost>costCeiling)') &&
  discovery.includes('scope==="current"') &&
  discovery.includes('scope==="origin"') &&
  discovery.includes('remainingAtStart') &&
  discovery.includes('if(cost>costCeiling)') &&
  discovery.includes('refresh_eligible_after:reservation?.refresh_eligible_after||null') &&
  discovery.includes('max_budget_usd') &&
  discovery.includes('Math.min(0.15,requestedBudget)'));
const retrySql=read('supabase/migrations/20261108_timeline_development_per_run_budget.sql');
check('Development retries retain authorization, duplicate-request lock and per-run reservation',()=>
 retrySql.includes('p.opted_in IS TRUE')&&retrySql.includes('pg_advisory_xact_lock')&&
 retrySql.includes('0.15')&&!retrySql.includes("state','cooldown")&&
 !timeline.includes('attemptedScopesThisSession'));
check('Cached timelines check research consent on load without starting paid generation', () =>
  timeline.includes('await loadEvents();') &&
  timeline.includes('await checkHistoryPermission();') &&
  timeline.includes("canContribute:()=>historyAuthorized") &&
  !timeline.includes('if(!data.length)await maybePopulateCompanyHistory()'));
check('Photos depend on business descriptions, never events or ticker-specific rules',()=>{
 const engine=read('supabase/functions/orca-timeline-photo-fill/index.ts');
 return engine.includes('async function businessQueries(')&&!engine.includes('eventVisualPlan')&&
 !engine.includes('eventCandidateScore')&&!engine.includes('ticker===')&&
 engine.includes('originalUrl(p.full_image_url)')&&engine.includes('if(added>=needed)break;');
});
check('Photo selection is initiated only by a signed-in Complete timeline click', () =>
  !photos.includes('Check Unsplash API') &&
  !photos.includes('diagnosticsButton') &&
  !photos.includes("button.addEventListener('click',()=>void fillPhotos())") &&
  !photos.includes('autoRepairAttempted') &&
  photos.includes('async function fillMissing({includeBrand=false}={})') &&
  photos.includes('await refreshAndMaybeFill()') &&
  timeline.includes('const photoResult=await photoMount.fillMissing({includeBrand:brandPhotoPending})'));

console.log('\nShared workspace checks: ' + passed + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
