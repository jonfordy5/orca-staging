import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createOwnerScopedResearchDispatcher} from
  '../services/orca-owned-oauth/read-only-research-dispatcher.mjs';
import {createOwnedMcpAdmission} from
  '../services/orca-owned-oauth/mcp-admission-http.mjs';
import {signBoundAccessToken} from
  '../services/orca-owned-oauth/bound-token.mjs';

const issuer='https://auth.orca.example';
const resource='https://mcp.orca.example/mcp';
const metadataUrl='https://mcp.orca.example/mcp/oauth-protected-resource';
const clientId='https://registered-agent.example/client.json';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const taskA='11111111-2222-4333-8444-555555555555';
const taskB='66666666-7777-4888-8999-aaaaaaaaaaaa';
const grantA=randomUUID(),grantB=randomUUID();
const kid='test-stage9-es256-key';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const due='2099-11-18T19:00:00.000Z';

function fixture(){
  let active=true,profileA=true,board='execution',broken=false;
  const sqlCalls=[],routed=[];
  const query=async(sql,values)=>{
    sqlCalls.push({sql,values});
    if(!sql.trim().toLowerCase().startsWith('select')||
       /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i.test(sql))
      throw Error('non_read_only_sql_detected');
    const owner=values[0];
    if(sql.startsWith('select display_name, opted_in from public.agent_profiles')){
      if(owner===ownerA&&profileA)
        return {rows:[{display_name:'ORCA Test A',opted_in:true}]};
      if(owner===ownerB)
        return {rows:[{display_name:'ORCA Test B',opted_in:true}]};
      return {rows:[]};
    }
    if(sql.includes('from public.stock_research_memberships')){
      return {rows:values[1]==='RKLB'? [{joined:1}]:[]};
    }
    if(sql.includes('from public.research_tasks')){
      if(broken)throw Error('database_unavailable');
      if(values[1] && values[1]!=='RKLB')return {rows:[]};
      return {rows:[{
        id:owner===ownerA?taskA:taskB,ticker:'RKLB',
        research_area:'Management',research_question:
          owner===ownerA?'A-only management assignment':'B-only earnings assignment',
        claimed_until:due,board_key:board,category_key:'management',metric_key:'execution'
      }]};
    }
    throw Error('unknown_read_query');
  };
  const dispatcher=createOwnerScopedResearchDispatcher({
    query,now:()=>Date.parse('2026-11-13T12:00:00Z')
  });
  const ownerForGrant=grant=>grant===grantA?ownerA:grant===grantB?ownerB:null;
  const admit=createOwnedMcpAdmission({
    issuer,resource,metadataUrl,advertised:true,enabled:true,
    verifierOptions:{
      issuer,resource,kid,publicKey,
      approvedClientIds:new Set([clientId]),
      currentGrant:async g=>active&&ownerForGrant(g.grantId)===g.ownerId&&
        g.clientId===clientId&&g.resource===resource&&
        g.scope==='orca:research.read'
    },
    dispatchReadOnly:async input=>{
      routed.push(input);
      return dispatcher(input);
    }
  });
  const token=ownerId=>signBoundAccessToken({
    issuer,resource,kid,privateKey,
    grant:{ownerId,grantId:ownerId===ownerA?grantA:grantB,
      clientId,resource,scope:'orca:research.read',active:true}
  });
  async function rpc(ownerId,method,tool,args={}){
    const payload={jsonrpc:'2.0',id:1,method};
    if(method==='tools/call')payload.params={
      name:tool,arguments:args
    };
    const resp=await admit(new Request(resource,{
      method:'POST',headers:{
        'content-type':'application/json',
        authorization:'Bearer '+token(ownerId)
      },
      body:JSON.stringify(payload)
    }));
    const json=await resp.json();
    return {status:resp.status,json};
  }
  return {rpc,routed,sqlCalls,setActive:x=>active=x,
    setProfileA:x=>profileA=x,setBoard:x=>board=x,setBroken:x=>broken=x};
}
const resultText=out=>JSON.parse(out.json.result.content[0].text);

test('MCP handshake and tool list perform no database reads',async()=>{
  const f=fixture();
  const init=await f.rpc(ownerA,'initialize');
  assert.equal(init.status,200);
  assert.equal(init.json.result.protocolVersion,'2025-06-18');
  const listed=await f.rpc(ownerA,'tools/list');
  assert.equal(listed.status,200);
  assert.deepEqual(listed.json.result.tools.map(x=>x.name),[
    'orca_whoami','orca_my_assignment'
  ]);
  assert.equal(f.sqlCalls.length,0);
});

test('two signed owners receive different aliases and assignments for the same ticker',async()=>{
  const f=fixture();
  const whoA=await f.rpc(ownerA,'tools/call','orca_whoami');
  const whoB=await f.rpc(ownerB,'tools/call','orca_whoami');
  assert.equal(resultText(whoA).researcher,'ORCA Test A');
  assert.equal(resultText(whoB).researcher,'ORCA Test B');
  const a=await f.rpc(ownerA,'tools/call','orca_my_assignment',{ticker:'rklb'});
  const b=await f.rpc(ownerB,'tools/call','orca_my_assignment',{ticker:'RKLB'});
  assert.equal(resultText(a).assignment.task_id,taskA);
  assert.equal(resultText(b).assignment.task_id,taskB);
  assert.ok(!JSON.stringify(a).includes('B-only'));
  assert.ok(!JSON.stringify(b).includes('A-only'));
  assert.equal(f.routed[2].ownerId,ownerA);
  assert.equal(f.routed[3].ownerId,ownerB);
  assert.ok(f.sqlCalls.every(x=>x.sql.trim().toLowerCase().startsWith('select')));
  assert.deepEqual(f.sqlCalls.filter(x=>x.sql.includes('from public.research_tasks'))
    .map(x=>x.values[0]),[ownerA,ownerB]);
});

test('client-supplied owner, alias and unjoined tickers cannot steal another account assignment',async()=>{
  const f=fixture();
  const injection=await f.rpc(ownerA,'tools/call','orca_my_assignment',{
    ownerId:ownerB,ticker:'RKLB'
  });
  assert.equal(injection.status,503,'unexpected owner arguments fail closed');
  const noTeam=await f.rpc(ownerA,'tools/call','orca_my_assignment',{ticker:'NVDA'});
  assert.equal(noTeam.status,200);
  assert.equal(resultText(noTeam).status,'team_required');
  assert.equal(f.sqlCalls.filter(x=>x.sql.includes('from public.research_tasks')).length,0);
});

test('profile opt-out, invalid board, private DB failure and revoked grants fail closed',async()=>{
  const f=fixture();
  f.setProfileA(false);
  const noProfile=await f.rpc(ownerA,'tools/call','orca_my_assignment',{ticker:'RKLB'});
  assert.equal(resultText(noProfile).status,'permission_required');
  f.setProfileA(true);
  f.setBoard('unauthorized-board');
  assert.equal((await f.rpc(ownerA,'tools/call','orca_my_assignment')).status,503);
  f.setBoard('execution');
  f.setBroken(true);
  assert.equal((await f.rpc(ownerA,'tools/call','orca_my_assignment')).status,503);
  f.setBroken(false);
  f.setActive(false);
  const before=f.sqlCalls.length;
  assert.equal((await f.rpc(ownerA,'tools/call','orca_my_assignment')).status,401);
  assert.equal(f.sqlCalls.length,before,
    'revoked JWT must fail before any owner data read');
});

test('SQL remains static and parameterized, never exposes tokens or arbitrary SQL',async()=>{
  const f=fixture();
  await f.rpc(ownerA,'tools/call','orca_my_assignment',{
    ticker:'RKLB'
  });
  const columns=f.sqlCalls.map(x=>x.sql);
  assert.ok(columns.some(s=>s.includes('where owner_id = $1::uuid')));
  assert.ok(columns.some(s=>s.includes('t.claimed_owner_id = $1::uuid')));
  assert.ok(columns.some(s=>s.includes('m.user_id = t.claimed_owner_id')));
  assert.ok(columns.every(x=>!x.includes(ownerA)));
  assert.ok(columns.every(x=>!x.includes(ownerB)));
});
