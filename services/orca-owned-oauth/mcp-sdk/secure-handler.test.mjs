import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createOrcaSdkMcpGateway} from './secure-handler.mjs';
import {signBoundAccessToken} from '../bound-token.mjs';

const issuer='https://auth.orca.example';
const resource='https://mcp.orca.example/mcp';
const metadataUrl='https://mcp.orca.example/.well-known/oauth-protected-resource/mcp';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientId='https://approved.example/oauth-client.json';
const grantA=randomUUID(),grantB=randomUUID();
const kid='sdk-v2-test-signing-key';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const taskA='11111111-2222-4333-8444-555555555555';
const taskB='66666666-7777-4888-8999-aaaaaaaaaaaa';

function fixture({enabled=true,advertised=true}={}){
  let grantActive=true,queries=[];
  const query=async(sql,params)=>{
    queries.push({sql,params});
    const owner=params[0];
    assert.ok([ownerA,ownerB].includes(owner));
    assert.ok(sql.toLowerCase().startsWith('select '),'SQL can only read');
    if(sql.startsWith('select display_name'))
      return {rows:[{display_name:owner===ownerA?'Researcher A':'Researcher B',opted_in:true}]};
    if(sql.startsWith('select 1 as joined'))
      return {rows:params[1]==='RKLB'?[{joined:1}]:[]};
    if(sql.startsWith('select t.id'))
      return {rows:[{
        id:owner===ownerA?taskA:taskB,ticker:'RKLB',
        research_area:'Management',
        research_question:owner===ownerA?'A-only question':'B-only question',
        claimed_until:'2099-12-01T12:00:00.000Z',
        board_key:'execution',category_key:'management',metric_key:'execution'
      }]};
    throw Error('unknown_fixed_sql');
  };
  const currentGrant=async ({ownerId,grantId,clientId:actual,resource:audience,scope})=>
    grantActive&&actual===clientId&&audience===resource&&
    scope==='orca:research.read'&&
    ((ownerId===ownerA&&grantId===grantA)||
     (ownerId===ownerB&&grantId===grantB));
  const gateway=createOrcaSdkMcpGateway({
    issuer,resource,metadataUrl,enabled,advertised,query,
    verifierOptions:{
      issuer,resource,kid,publicKey,
      approvedClientIds:new Set([clientId]),currentGrant
    }
  });
  const token=ownerId=>signBoundAccessToken({
    issuer,resource,kid,privateKey,
    grant:{active:true,ownerId,clientId,
      grantId:ownerId===ownerA?grantA:grantB,
      resource,scope:'orca:research.read'}
  });
  async function send(ownerId,method,params={},headers={}){
    const req=new Request(resource,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'accept':'application/json, text/event-stream',
        'mcp-protocol-version':'2025-06-18',
        ...(ownerId?{authorization:'Bearer '+token(ownerId)}:{}),
        ...headers
      },
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
    });
    return gateway.fetch(req);
  }
  return {gateway,send,token,queries:()=>queries,setGrantActive:x=>grantActive=x};
}
async function rpcBody(response){
  const raw=await response.text();
  if(raw.startsWith('data:'))return JSON.parse(raw.slice(5).trim());
  const match=raw.match(/^data:\s*(.+)$/m);
  if(match)return JSON.parse(match[1]);
  return JSON.parse(raw);
}
test('SDK gateway is disabled by default even with a valid signed bearer',async()=>{
  const gateway=createOrcaSdkMcpGateway({issuer,resource,metadataUrl});
  assert.equal((await gateway.fetch(new Request(metadataUrl))).status,404);
  assert.equal((await gateway.fetch(new Request(resource,{method:'POST'}))).status,503);
});
test('OAuth discovery advertises exact resource, read scope and issuer only',async()=>{
  const f=fixture();
  const r=await f.gateway.fetch(new Request(metadataUrl));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{
    resource,authorization_servers:[issuer],
    scopes_supported:['orca:research.read'],
    bearer_methods_supported:['header']
  });
  assert.equal((await f.gateway.fetch(new Request(
    'https://mcp.orca.example/mcp/oauth-protected-resource'
  ))).status,404);
});
test('missing or forged agent bearer yields metadata challenge and no SQL',async()=>{
  const f=fixture();
  const empty=await f.send(null,'tools/list');
  assert.equal(empty.status,401);
  assert.equal(empty.headers.get('www-authenticate'),
    'Bearer resource_metadata="'+metadataUrl+'", scope="orca:research.read"');
  const forged=await f.gateway.fetch(new Request(resource,{
    method:'POST',headers:{
      authorization:'Bearer forged.jwt.signature',
      'content-type':'application/json'
    },body:'{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  }));
  assert.equal(forged.status,401);
  assert.equal(f.queries().length,0);
});
test('official MCP SDK initializes, lists only ORCA read tools and calls them',async()=>{
  const f=fixture();
  const init=await f.send(ownerA,'initialize',{
    protocolVersion:'2025-06-18',capabilities:{},
    clientInfo:{name:'orca-stage12-synthetic-client',version:'1.0.0'}
  });
  assert.equal(init.status,200,await init.clone().text());
  const initJson=await rpcBody(init);
  assert.match(JSON.stringify(initJson),/orca-research-readonly/);
  const list=await f.send(ownerA,'tools/list',{});
  assert.equal(list.status,200,await list.clone().text());
  const listed=await rpcBody(list);
  const names=listed.result?.tools?.map(t=>t.name);
  assert.deepEqual(names,['orca_whoami','orca_my_assignment']);
  assert.ok(listed.result.tools.every(t=>t.annotations?.readOnlyHint===true));
  assert.equal(f.queries().length,0);
  const who=await f.send(ownerA,'tools/call',{name:'orca_whoami',arguments:{}});
  assert.equal(who.status,200,await who.clone().text());
  const whoJson=await rpcBody(who);
  assert.match(whoJson.result.content[0].text,/Researcher A/);
  const task=await f.send(ownerA,'tools/call',{
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  });
  assert.equal(task.status,200,await task.clone().text());
  const taskJson=await rpcBody(task);
  assert.match(taskJson.result.content[0].text,/A-only question/);
  assert.equal(f.queries().filter(x=>x.sql.startsWith('select t.id')).length,1);
});
test('SDK rejects unknown publishing tool and malicious schema values before reads',async()=>{
  const f=fixture();
  const badTool=await f.send(ownerA,'tools/call',{
    name:'orca_publish_finding',arguments:{owner_id:ownerB}
  });
  assert.notEqual(badTool.status,503);
  assert.ok(!JSON.stringify(await rpcBody(badTool)).includes('B-only question'));
  const badArgs=await f.send(ownerA,'tools/call',{
    name:'orca_my_assignment',arguments:{ticker:'RKLB',ownerId:ownerB}
  });
  assert.notEqual(badArgs.status,503);
  assert.equal(f.queries().length,0,'unapproved tool inputs cannot reach SQL');
});
test('two real SDK requests remain owner isolated; revoke immediately prevents reads',async()=>{
  const f=fixture();
  const a=await rpcBody(await f.send(ownerA,'tools/call',{
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  }));
  const b=await rpcBody(await f.send(ownerB,'tools/call',{
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  }));
  assert.match(a.result.content[0].text,/A-only question/);
  assert.match(b.result.content[0].text,/B-only question/);
  assert.ok(!JSON.stringify(a).includes('B-only question'));
  assert.deepEqual(f.queries().filter(x=>x.sql.startsWith('select t.id'))
    .map(x=>x.params[0]),[ownerA,ownerB]);
  f.setGrantActive(false);
  const count=f.queries().length;
  assert.equal((await f.send(ownerA,'tools/list')).status,401);
  assert.equal(f.queries().length,count);
});
