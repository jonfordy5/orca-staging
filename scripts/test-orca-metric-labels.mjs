import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {metricDisplayParts,metricDisplayText} from '../orca-metric-labels.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=readFileSync(path.join(root,'research-workspace.html'),'utf8');
const catalogStart=workspace.indexOf('const researchCategories=[');
const catalogEnd=workspace.indexOf('const approvedMetrics=',catalogStart);
const sourceCatalog=workspace.slice(catalogStart,catalogEnd);
const catalog=vm.runInNewContext(sourceCatalog+'\nresearchCategories', {});

const cases=[
 ['SEC Filings & Catalysts','Royal Decrees'],
 ['News & Market Sentiment','War Drums'],
 ['Fundamentals & Valuation','The Ledger'],
 ['Technical Analysis','Battle Map'],
 ['Volume & Market Positioning','Troop Movements'],
 ['Volume','Troop Movements'],
 ['Options','Signal Fires']
];
test('all established research metrics have friendly Legends titles and original subtitles',()=>{
 for(const [canonical,themed] of cases){
  assert.deepEqual(metricDisplayParts(canonical),{title:themed,subtitle:canonical,themed:true});
  assert.equal(metricDisplayText(canonical),themed+' — '+canonical);
  assert.equal(metricDisplayParts(canonical.toLowerCase()).title,themed);
 }
});
test('unknown and unapproved metrics are shown truthfully, never remapped to an invented category',()=>{
 assert.deepEqual(metricDisplayParts('Future Public Evidence'),{title:'Future Public Evidence',subtitle:'',themed:false});
 assert.equal(metricDisplayText('  Satellite Data  '),'Satellite Data');
 assert.equal(metricDisplayText(''),'Research metric');
 assert.equal(metricDisplayText(null),'Research metric');
 assert.equal(metricDisplayText('<script>bad</script>'),'<script>bad</script>');
});
test('underlying six-key catalog, canonical task areas, and assigned board selectors are unchanged',()=>{
 const keys=catalog.flatMap(c=>c.metrics.map(m=>m.key));
 const areas=catalog.flatMap(c=>c.metrics.map(m=>m.area));
 assert.deepEqual(Array.from(keys),[
  'sec.filings_catalysts','fundamentals.valuation','volume.relative','volume.options',
  'technical.technical_analysis','news.market_sentiment'
 ]);
 assert.deepEqual(Array.from(areas),[
  'SEC Filings & Catalysts','Fundamentals & Valuation','Volume','Options',
  'Technical Analysis','News & Market Sentiment'
 ]);
 for(const cat of catalog)for(const m of cat.metrics)
  assert.ok(metricDisplayText(m.area).includes(m.area));
 assert.ok(workspace.includes("option.value=metric.key;option.textContent=metricDisplayText(metric.label)"));
 assert.ok(workspace.includes("const assigned=assignedResearchBoard?.task_id===claim.id?assignedResearchBoard:null;"));
 assert.ok(workspace.includes("select.value=boardKey;"));
 assert.ok(workspace.includes("function ratingMeta(q,r,d){return '[ORCA-R4;Q:'+q+';A:'+r+';D:'+d+'] ';}"));
 assert.ok(workspace.includes("assignment:claim&&assignedResearchBoard&&assignedResearchBoard.task_id===claim.id?{metric:claim.research_area"));
 assert.ok(workspace.includes("metric:f.research_area,"));
 assert.ok(workspace.includes("p_task_id:claim.id"));
});
test('research cards show themed title and readable original labels via textContent',()=>{
 const begin=workspace.indexOf('function appendMetricIdentity(');
 const end=workspace.indexOf('function compactFinding(',begin);
 assert.ok(begin>0&&end>begin);
 const created=[];
 const doc={createElement(tag){
  const node={tagName:tag,textContent:'',className:''};
  created.push(node);return node;
 }};
 const ctx={document:doc,metricDisplayParts};
 vm.runInNewContext(workspace.slice(begin,end)+'\nglobalThis.appendMetricIdentity=appendMetricIdentity;',ctx);
 const rootNode={children:[],append(child){this.children.push(child)}};
 ctx.appendMetricIdentity(rootNode,'Technical Analysis','alys ai');
 assert.equal(rootNode.children[0].tagName,'strong');
 assert.equal(rootNode.children[0].textContent,'Battle Map');
 assert.equal(rootNode.children[1].textContent,'Technical Analysis · alys ai');
 const unknownNode={children:[],append(child){this.children.push(child)}};
 ctx.appendMetricIdentity(unknownNode,'New Unmapped Research','Researcher 3');
 assert.equal(unknownNode.children[0].textContent,'New Unmapped Research');
 assert.equal(unknownNode.children[1].textContent,'Researcher 3');
});
test('existing approved three realm art, board IDs and chart/timeline layout remain intact',()=>{
 for(const s of ['The King\'s Keep','The Vault','The Frontier',
 'investor-answer-execution','investor-answer-pricing','investor-answer-positioning',
 'assets/orca-world-management.webp','assets/orca-world-earnings.webp','assets/orca-world-positioning.webp']){
  assert.ok(workspace.includes(s),s);
 }
 assert.ok(workspace.includes("theme:'dark'"));
 assert.ok(workspace.includes("colorTheme:'dark'"));
 assert.ok(workspace.includes('id="timeline-frame"'));
 assert.ok(workspace.includes('id="chart-frame"'));
 assert.ok(workspace.indexOf('id="chart-frame"')<workspace.indexOf('id="timeline-frame"'));
});
