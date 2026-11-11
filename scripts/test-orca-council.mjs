import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {selectCouncilEvidence,councilLeadLabel,COUNCIL_REVIEW_WINDOWS} from '../orca-council.js';

const NOW=Date.parse('2026-11-11T16:00:00Z');
const time=(delta)=>new Date(NOW+delta).toISOString();
let serial=0;
function finding({area='News & Market Sentiment',board='execution',rating='BUY',dir='BULLISH',author='one',observed=-3600000,published=-1800000,expires=86400000,source=['https://example.com/evidence'],limitations=''}={}){
 return {id:'c'+(++serial),task_id:'task'+serial,research_area:area,
  contributor_alias:author,summary:`[ORCA-R4;Q:${board};A:${rating};D:${dir}] Source-backed context with documented limits.`,
  observed_at:observed===null?null:time(observed),published_at:published===null?null:time(published),
  expires_at:expires===null?null:time(expires),source_urls:source,limitations};
}
test('recent source-backed BUY and SELL go to two opposing cards',()=>{
 const a=finding(),b=finding({author:'two',rating:'SELL',dir:'BEARISH'});
 const view=selectCouncilEvidence([a,b],NOW);
 assert.equal(view.current.length,2);assert.equal(view.bullish.length,1);assert.equal(view.bearish.length,1);
 assert.equal(view.archive.length,0);assert.equal(view.lead,'split');
 assert.equal(councilLeadLabel(view),'Recent research is divided');
});
test('no invented challenger or broad consensus when one side has no evidence',()=>{
 const view=selectCouncilEvidence([finding()],NOW);
 assert.equal(view.lead,'bullish');assert.equal(view.bearish.length,0);
 assert.equal(councilLeadLabel(view),'Recent research leans bullish');
});
test('dated observation freshness is per-metric, not publication time or all-time rounds',()=>{
 const staleNews=finding({observed:-4*86400000,published:-60000});
 const recentFundamentals=finding({area:'Fundamentals & Valuation',board:'pricing',observed:-15*86400000,published:-20000});
 const ancientFundamentals=finding({area:'Fundamentals & Valuation',board:'pricing',observed:-31*86400000,published:-20000});
 const view=selectCouncilEvidence([staleNews,recentFundamentals,ancientFundamentals],NOW);
 assert.equal(view.current.length,1);
 assert.equal(view.current[0].id,recentFundamentals.id);
 assert.equal(view.archive.length,2);
 assert.equal(COUNCIL_REVIEW_WINDOWS['news & market sentiment'],3*86400000);
});
test('expired claims of evidence, missing sources, malformed records and future timestamps are never fresh',()=>{
 const rows=[
  finding({expires:-1}),finding({source:[]}),finding({source:['javascript:evil()']}),
  finding({observed:null}),finding({published:null}),finding({observed:1000}),
  finding({published:1000}),finding({expires:'invalid'}),finding({area:'Unclassified Research'}),
  finding({rating:'BUY',dir:'BEARISH'}),{summary:'plain text'},null
 ];
 const view=selectCouncilEvidence(rows,NOW);
 assert.equal(view.current.length,0);assert.equal(view.archive.length,11);
 assert.equal(view.lead,'none');assert.equal(councilLeadLabel(view),'Fresh research needed');
});
test('latest same-alias same-metric finding wins; distinct metrics remain separate without claiming distinct people',()=>{
 const older=finding({author:'ORCA Agent',observed:-70000,published:-60000});
 const newer=finding({author:'orca agent',observed:-50000,published:-10000});
 const otherMetric=finding({author:'ORCA Agent',area:'Technical Analysis',board:'positioning',observed:-30000,published:-5000});
 const view=selectCouncilEvidence([older,newer,otherMetric],NOW);
 assert.deepEqual(view.current.map(f=>f.id),[otherMetric.id,newer.id]);
 assert.equal(view.archive.length,1);
 assert.equal(view.authorLabels,1,'a display alias is not an authenticated unique-owner count');
});
test('source records are not modified; current data is a separate derived view',()=>{
 const a=finding({source:['https://www.sec.gov/ixviewer','not-a-url'],limitations:'Neutron not yet operational'});
 const original=JSON.stringify(a), view=selectCouncilEvidence([a],NOW);
 assert.equal(JSON.stringify(a),original);
 assert.equal(view.current[0].source_urls.length,1);
 assert.equal(view.current[0].limitations,'Neutron not yet operational');
});
test('existing page does not use all-round cumulative counts to drive the live verdict',()=>{
 const html=readFileSync(new URL('../research-workspace.html',import.meta.url),'utf8');
 const council=html.slice(html.indexOf('function renderOutlookBalance('),html.indexOf('async function loadResearchRatingTrack()'));
 assert.ok(council.includes('selectCouncilEvidence(findings,Date.now())'));
 assert.ok(council.includes('cumulativeResearchStatus?.total'));
 assert.ok(!council.includes('cumulativeResearchStatus?.bullish_count'));
 assert.ok(!council.includes('cumulativeResearchStatus?.bearish_count'));
 assert.ok(council.includes("const selected=recentFirst(sideFindings,'observed_at')[0]"));
 assert.ok(council.includes('record.summary'),'historic cached synthesis should remain visible in archive');
 assert.ok(html.includes('id="council-archive"'));
 assert.ok(html.includes('id="council-archive-body"'));
 assert.ok(html.includes('href="#contributor-tools"'));
});
