import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeStockTicker, readAgentState, READONLY_SCHEMA } from '../supabase/functions/orca-agent-readonly/policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const edge = readFileSync(join(root, 'supabase/functions/orca-agent-readonly/index.ts'), 'utf8');
const owner = '12345678-1234-4234-8234-123456789abc';
const task = 'abcdefab-1234-4234-8234-123456789abc';
const now = new Date('2026-11-12T20:00:00.000Z');

function mockClient({
  profile = {display_name:'Aly AI', opted_in:true, independent_publish_enabled:false},
  membership = {ticker:'RKLB'},
  claim = {id:task, ticker:'RKLB', research_area:'Volume',research_question:'Investigate volume',claimed_until:'2026-11-12T22:00:00Z'},
  board = {task_id:task,board_label:'Investors',board_key:'positioning'},
  broken = null
}={}){
  const calls = [];
  const from = table => {
    const values = table === 'agent_profiles' ? profile : table === 'stock_research_memberships' ? membership : null;
    if (!['agent_profiles','stock_research_memberships'].includes(table)) throw new Error('forbidden_table');
    const filters = [];
    const chain = {
      select(fields){calls.push(['select',table,fields]);return chain;},
      eq(column,value){filters.push([column,value]);return chain;},
      async maybeSingle(){
        calls.push(['maybeSingle',table,filters]);
        return {data:values,error:broken===table?{message:'denied'}:null};
      }
    };
    return chain;
  };
  const rpc = async (fn,args) => {
    calls.push(['rpc',fn,args]);
    if(!['commons_my_claim','orca_my_assigned_board'].includes(fn)) throw new Error('forbidden_rpc');
    return {data:fn==='commons_my_claim'?claim:board,error:broken===fn?{message:'denied'}:null};
  };
  return {client:{from,rpc},calls};
}

test('ticker normalization rejects invalid or malformed stock identifiers',()=>{
  assert.equal(normalizeStockTicker(' rklb '),'RKLB');
  assert.equal(normalizeStockTicker('BRK.B'),'BRK.B');
  for(const bad of ['','RKLB; DROP','../RKLB','RKL-B','A'.repeat(11),null,{},'@RKLB'])
    assert.throws(()=>normalizeStockTicker(bad),/ticker/);
});

test('whoami returns only the verified owner profile, without querying other tables',async()=>{
  const fx=mockClient();
  const result=await readAgentState(fx.client,owner,{now});
  assert.equal(result.schema,READONLY_SCHEMA);
  assert.equal(result.researcher,'Aly AI');
  assert.equal(result.publishing_review,'review_required');
  assert.equal(result.joined,null);
  assert.equal(result.assignment,null);
  assert.deepEqual(fx.calls,[
    ['select','agent_profiles','display_name,opted_in,independent_publish_enabled'],
    ['maybeSingle','agent_profiles',[['owner_id',owner]]]
  ]);
  assert.equal(JSON.stringify(result).includes(owner),false);
});

test('my_assignment uses only the authenticated owner and existing owner-scoped RPCs',async()=>{
  const fx=mockClient();
  const result=await readAgentState(fx.client,owner,{ticker:'rklb',now});
  assert.equal(result.status,'assigned');
  assert.equal(result.assignment.task_id,task);
  assert.equal(result.assignment.board_key,'positioning');
  assert.equal(result.assignment.due_at,'2026-11-12T22:00:00.000Z');
  assert.deepEqual(fx.calls.filter(c=>c[0]==='rpc'),[
    ['rpc','commons_my_claim',{p_ticker:'RKLB'}],
    ['rpc','orca_my_assigned_board',{p_task_id:task}]
  ]);
  assert.ok(fx.calls.some(c=>c[0]==='maybeSingle'&&c[1]==='stock_research_memberships'&&c[2].some(([key,value])=>key==='user_id'&&value===owner)));
});

test('no profile or no membership cannot read an owned assignment',async()=>{
  for(const params of [{profile:null},{membership:null}]){
    const fx=mockClient(params);
    const result=await readAgentState(fx.client,owner,{ticker:'RKLB',now});
    assert.equal(result.assignment,null);
    assert.equal(fx.calls.some(c=>c[0]==='rpc'),false);
  }
});

test('permission off fails closed without checking current claim',async()=>{
  const fx=mockClient({profile:{display_name:'Aly AI',opted_in:false,independent_publish_enabled:true}});
  const result=await readAgentState(fx.client,owner,{ticker:'RKLB',now});
  assert.equal(result.status,'permission_required');
  assert.equal(result.research_enabled,false);
  assert.equal(result.assignment,null);
  assert.equal(fx.calls.some(c=>c[0]==='rpc'),false);
});

test('unclaimed and expired tasks do not trigger extra claims or false active assignments',async()=>{
  let fx=mockClient({claim:null});
  assert.equal((await readAgentState(fx.client,owner,{ticker:'RKLB',now})).assignment,null);
  fx=mockClient({claim:{id:task,ticker:'RKLB',claimed_until:'2026-11-12T19:00:00Z'}});
  const result=await readAgentState(fx.client,owner,{ticker:'RKLB',now});
  assert.equal(result.status,'assignment_expired');
  assert.equal(result.assignment,null);
  assert.deepEqual(fx.calls.filter(c=>c[0]==='rpc').map(c=>c[1]),['commons_my_claim']);
});

test('missing/mismatched board and RLS failures do not silently become no assignment',async()=>{
  for(const data of [{board:null},{board:{task_id:task,board_label:'Investors',board_key:'forged'}},{broken:'agent_profiles'},{broken:'orca_my_assigned_board'}]){
    const fx=mockClient(data);
    await assert.rejects(readAgentState(fx.client,owner,{ticker:'RKLB',now}),/unavailable|mismatch/);
  }
  assert.rejects(readAgentState(mockClient().client,'claimed-user-id-from-browser',{ticker:'RKLB',now}),/verified_identity_required/);
});

test('edge transport verifies user session, restricts methods and never uses service-role or write RPCs',()=>{
  assert.match(edge,/auth\.getUser\(token\)/);
  assert.match(edge,/Authorization: `Bearer \$\{token\}`/);
  assert.match(edge,/req\.method !== 'POST'/);
  assert.match(edge,/\['whoami', 'my_assignment'\]/);
  assert.match(edge,/Cache-Control.*no-store/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin|commons_publish|claim_next|from\(['"]auth\.users/);
});
