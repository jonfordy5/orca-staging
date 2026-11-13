// Stage 13: real Node loopback HTTP socket -> official MCP SDK gateway.
// Real client/server networking here uses ONLY fake accounts, ephemeral
// signing keys, local in-memory SQL fixtures and an explicitly test-only
// loopback trust callback. No public HTTP/TLS listener is deployed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as nodeHttpRequest} from 'node:http';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createOrcaMcpNodeServer} from './node-ingress.mjs';
import {createOrcaSdkMcpGateway} from './secure-handler.mjs';
import {signBoundAccessToken} from '../bound-token.mjs';

const issuer='https://auth.orca.example';
const resource='https://mcp.orca.example/mcp';
const origin='https://mcp.orca.example';
const metadataUrl='https://mcp.orca.example/.well-known/oauth-protected-resource/mcp';
const clientId='https://approved.example/client.json';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const kid='stage13-https-ingress-key';
const grantA=randomUUID(),grantB=randomUUID();
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});

// TEST-ONLY Fetch-compatible transport over real Node TCP sockets.
// Undici may override the Host of a 127.0.0.1 URL. Using http.request here
// preserves the simulated public Host, so production host checks stay strict.
async function wireFetch(input,init={},testHost='mcp.orca.example'){
  const request=new Request(input,{
    ...init,...(init?.body?{duplex:'half'}:{})
  });
  const u=new URL(request.url);
  const bytes=request.method==='POST'?
    Buffer.from(await request.arrayBuffer()):Buffer.alloc(0);
  const headers=Object.fromEntries(request.headers.entries());
  headers.host=testHost;
  if(request.method==='POST')headers['content-length']=String(bytes.length);
  return new Promise((resolve,reject)=>{
    const outgoing=nodeHttpRequest({
      hostname:u.hostname,port:u.port,path:u.pathname+u.search,
      method:request.method,headers
    },incoming=>{
      const chunks=[];
      incoming.on('data',x=>chunks.push(x));
      incoming.on('error',reject);
      incoming.on('end',()=>{
        const status=incoming.statusCode||503;
        const payload=Buffer.concat(chunks);
        resolve(new Response([204,205,304].includes(status)?null:payload,{
          status,headers:incoming.headers
        }));
      });
    });
    outgoing.on('error',reject);
    outgoing.setTimeout(5000,()=>outgoing.destroy(Error('test_http_timeout')));
    if(bytes.length)outgoing.write(bytes);
    outgoing.end();
  });
}

async function setup(t,{enabled=true,trustLoopback=true}={}){
  let active=true;
  const queries=[];
  const query=async (sql,params)=>{
    queries.push({sql,params});
    assert.ok(sql.startsWith('select '));
    assert.ok([ownerA,ownerB].includes(params[0]));
    if(sql.startsWith('select display_name'))
      return {rows:[{display_name:params[0]===ownerA?'Researcher A':'Researcher B',opted_in:true}]};
    if(sql.startsWith('select 1 as joined'))
      return {rows:params[1]==='RKLB'?[{joined:1}]:[]};
    if(sql.startsWith('select t.id'))
      return {rows:[{
        id:params[0]===ownerA?
          '11111111-2222-4333-8444-555555555555':
          '66666666-7777-4888-8999-aaaaaaaaaaaa',
        ticker:'RKLB',research_area:'Management',
        research_question:params[0]===ownerA?'A-only official research':'B-only official research',
        claimed_until:'2099-12-01T12:00:00.000Z',
        board_key:'execution',category_key:'management',metric_key:'execution'
      }]};
    throw Error('unexpected_sql');
  };
  const gateway=createOrcaSdkMcpGateway({
    issuer,resource,metadataUrl,advertised:true,enabled:true,query,
    verifierOptions:{
      issuer,resource,kid,publicKey,
      approvedClientIds:new Set([clientId]),
      currentGrant:async ({ownerId,grantId,resource:aud,scope,clientId:client})=>
        active&&aud===resource&&scope==='orca:research.read'&&
        client===clientId&&(
          ownerId===ownerA&&grantId===grantA||
          ownerId===ownerB&&grantId===grantB
        )
    }
  });
  const server=createOrcaMcpNodeServer({
    gateway,publicOrigin:origin,enabled,
    // Test ONLY. Real deployment MUST terminate TLS at a trusted
    // authenticated ingress and not use loopback address alone as trust.
    ...(trustLoopback?{
      isTrustedIngress:req=>
        req.socket?.remoteAddress==='127.0.0.1'&&
        req.socket?.localAddress==='127.0.0.1'
    }:{})
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const token=ownerId=>signBoundAccessToken({
    issuer,resource,kid,privateKey,
    grant:{
      active:true,ownerId,resource,scope:'orca:research.read',clientId,
      grantId:ownerId===ownerA?grantA:grantB
    }
  });
  const send=(path,opts={})=>wireFetch(base+path,opts);
  return {base,token,queries,setActive:x=>active=x,send};
}
test('disabled ingress cannot expose even MCP discovery',async t=>{
  const s=await setup(t,{enabled:false});
  assert.equal((await s.send('/.well-known/oauth-protected-resource/mcp')).status,503);
  assert.equal((await s.send('/mcp',{method:'POST'})).status,503);
});

test('real Node HTTP without explicit trusted TLS callback denies X-Forwarded-Proto spoof',async t=>{
  const s=await setup(t,{trustLoopback:false});
  const res=await s.send('/.well-known/oauth-protected-resource/mcp',{
    headers:{'x-forwarded-proto':'https'}
  });
  assert.equal(res.status,403);
});
test('trusted ingress validates host, origin, cookie, path, query and body size',async t=>{
  const s=await setup(t);
  const badHost=await wireFetch(s.base+'/mcp',{},'evil.example');
  assert.equal(badHost.status,421);
  const browser=await s.send('/mcp',{
    method:'POST',headers:{origin:'https://evil.example'}
  });
  assert.equal(browser.status,403);
  const cookie=await s.send('/mcp',{headers:{cookie:'session=evil'}});
  assert.equal(cookie.status,403);
  assert.equal((await s.send('/mcp?token=evil')).status,404);
  assert.equal((await s.send('/mcp%2Fother')).status,404);
  const oversized=await s.send('/mcp',{
    method:'POST',headers:{'content-type':'application/json'},
    body:'x'.repeat(17000)
  });
  assert.equal(oversized.status,413);
  assert.equal(s.queries.length,0);
});
test('real socket delivers official OAuth discovery and proper bearer challenge',async t=>{
  const s=await setup(t);
  const metadata=await s.send('/.well-known/oauth-protected-resource/mcp');
  assert.equal(metadata.status,200);
  const info=await metadata.json();
  assert.equal(info.resource,resource);
  assert.deepEqual(info.authorization_servers,[issuer]);
  const unauthorized=await s.send('/mcp',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
  });
  assert.equal(unauthorized.status,401);
  assert.match(unauthorized.headers.get('www-authenticate'),/oauth-protected-resource\/mcp/);
  assert.equal(s.queries.length,0);
});
test('two official MCP clients use REAL Node TCP HTTP and remain isolated after revocation',async t=>{
  const s=await setup(t);
  const makeClient=async(ownerId)=>{
    const client=new Client({name:'stage13-network-client',version:'1.0.0'});
    const transport=new StreamableHTTPClientTransport(
      new URL(s.base+'/mcp'),{
        fetch:wireFetch,
        authProvider:{token:async()=>s.token(ownerId)}
      }
    );
    await client.connect(transport);
    return client;
  };
  const a=await makeClient(ownerA),b=await makeClient(ownerB);
  t.after(async()=>Promise.allSettled([a.close(),b.close()]));
  const list=await a.listTools();
  assert.deepEqual(list.tools.map(x=>x.name),['orca_whoami','orca_my_assignment']);
  const outA=await a.callTool({name:'orca_my_assignment',arguments:{ticker:'RKLB'}});
  const outB=await b.callTool({name:'orca_my_assignment',arguments:{ticker:'RKLB'}});
  assert.match(outA.content[0].text,/A-only official research/);
  assert.match(outB.content[0].text,/B-only official research/);
  assert.ok(!outA.content[0].text.includes('B-only'));
  assert.deepEqual(s.queries.filter(x=>x.sql.startsWith('select t.id')).map(x=>x.params[0]),[ownerA,ownerB]);
  s.setActive(false);
  const before=s.queries.length;
  await assert.rejects(a.callTool({name:'orca_whoami',arguments:{}}),/unauthoriz|401|authentication/i);
  assert.equal(s.queries.length,before);
});
