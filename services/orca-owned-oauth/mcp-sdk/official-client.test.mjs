// Stage 12b — official MCP CLIENT -> official ORCA MCP SERVER acceptance.
// OFFLINE / SYNTHETIC ONLY. fetch() is locally injected so no public server,
// real OAuth token, Supabase request, agent account or production connection.
// Unlike handwritten JSON-RPC calls, the real v2 SDK client negotiates the
// protocol, lists tools and invokes them using its own transport serializer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from
  '@modelcontextprotocol/client';
import {createOrcaSdkMcpGateway} from './secure-handler.mjs';
import {signBoundAccessToken} from '../bound-token.mjs';

const issuer='https://auth.orca.example';
const resource='https://mcp.orca.example/mcp';
const metadataUrl='https://mcp.orca.example/.well-known/oauth-protected-resource/mcp';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientId='https://approved.example/oauth-client.json';
const grantA=randomUUID(),grantB=randomUUID();
const kid='stage12-client-test-key';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const taskA='11111111-2222-4333-8444-555555555555';
const taskB='66666666-7777-4888-8999-aaaaaaaaaaaa';

function fixture(){
  let grantActive=true;
  const calls=[];
  const query=async(sql,values)=>{
    calls.push({sql,values});
    assert.ok([ownerA,ownerB].includes(values[0]));
    assert.ok(sql.trim().startsWith('select '),'Only static read SQL');
    if(sql.startsWith('select display_name'))
      return {rows:[{
        display_name:values[0]===ownerA?'Researcher A':'Researcher B',
        opted_in:true
      }]};
    if(sql.startsWith('select 1 as joined'))
      return {rows:values[1]==='RKLB'?[{joined:1}]:[]};
    if(sql.startsWith('select t.id'))
      return {rows:[{
        id:values[0]===ownerA?taskA:taskB,
        ticker:'RKLB',research_area:'Management',
        research_question:values[0]===ownerA?'A-only query':'B-only query',
        claimed_until:'2099-12-01T12:00:00.000Z',
        board_key:'execution',category_key:'management',metric_key:'execution'
      }]};
    throw Error('unexpected SQL');
  };
  const gateway=createOrcaSdkMcpGateway({
    issuer,resource,metadataUrl,advertised:true,enabled:true,query,
    verifierOptions:{
      kid,publicKey,approvedClientIds:new Set([clientId]),
      currentGrant:async({grantId,ownerId,clientId:actual,resource:aud,scope})=>
        grantActive&&actual===clientId&&aud===resource&&
        scope==='orca:research.read'&&
        ((ownerId===ownerA&&grantId===grantA)||
         (ownerId===ownerB&&grantId===grantB))
    }
  });
  const token=ownerId=>signBoundAccessToken({
    issuer,resource,kid,privateKey,
    grant:{active:true,ownerId,clientId,
      grantId:ownerId===ownerA?grantA:grantB,
      resource,scope:'orca:research.read'}
  });
  // The official client sends HTTP Requests through this test-only adapter.
  // Re-map the synthetic local URL to the configured HTTPS resource.
  // A real deployment MUST use actual HTTPS, never this URL rewrite.
  const simulatedFetch=async(input,init)=>{
    const incoming=new Request(input,init);
    const original=new URL(incoming.url);
    assert.equal(original.hostname,'127.0.0.1');
    assert.equal(original.pathname,'/mcp');
    const headers=new Headers(incoming.headers);
    headers.delete('host');
    const rewritten=new Request(resource,{
      method:incoming.method,
      headers,
      ...(incoming.method!=='GET'&&incoming.method!=='HEAD'?
        {body:incoming.body,duplex:'half'}:{})
    });
    return gateway.fetch(rewritten);
  };
  const open=async ownerId=>{
    const client=new Client({name:'orca-connector-acceptance',version:'1.0.0'});
    const transport=new StreamableHTTPClientTransport(
      new URL('http://127.0.0.1:8888/mcp'),{
        fetch:simulatedFetch,
        authProvider:{token:async()=>token(ownerId)}
      }
    );
    await client.connect(transport);
    return {client,transport};
  };
  return {open,calls,setActive:x=>grantActive=x};
}
test('official MCP client negotiates, lists two read-only ORCA tools and calls owner-scoped assignment',async t=>{
  const f=fixture();
  const {client}=await f.open(ownerA);
  t.after(()=>client.close());
  assert.equal(client.getServerVersion()?.name,'orca-research-readonly');
  const list=await client.listTools();
  assert.deepEqual(list.tools.map(x=>x.name),[
    'orca_whoami','orca_my_assignment'
  ]);
  assert.ok(list.tools.every(x=>x.annotations?.readOnlyHint===true));
  const identity=await client.callTool({name:'orca_whoami',arguments:{}});
  assert.match(identity.content?.[0]?.text||'',/Researcher A/);
  const task=await client.callTool({
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  });
  assert.match(task.content?.[0]?.text||'',/A-only query/);
  assert.equal(f.calls.filter(x=>x.sql.startsWith('select t.id')).length,1);
});
test('two separate official clients cannot see one another; revoke blocks the original token',async t=>{
  const f=fixture();
  const a=await f.open(ownerA),b=await f.open(ownerB);
  t.after(async()=>{await Promise.allSettled([a.client.close(),b.client.close()]);});
  const resultA=await a.client.callTool({
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  });
  const resultB=await b.client.callTool({
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  });
  assert.match(resultA.content[0].text,/A-only query/);
  assert.match(resultB.content[0].text,/B-only query/);
  assert.ok(!resultA.content[0].text.includes('B-only query'));
  assert.ok(!resultB.content[0].text.includes('A-only query'));
  assert.deepEqual(f.calls.filter(x=>x.sql.startsWith('select t.id'))
    .map(x=>x.values[0]),[ownerA,ownerB]);
  f.setActive(false);
  const before=f.calls.length;
  await assert.rejects(a.client.callTool({
    name:'orca_my_assignment',arguments:{ticker:'RKLB'}
  }),/unauthoriz|401|authentication/i);
  assert.equal(f.calls.length,before,'revoke must deny before querying owner data');
});
