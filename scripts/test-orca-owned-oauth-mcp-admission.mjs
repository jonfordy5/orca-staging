import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createOwnedMcpAdmission} from
  '../services/orca-owned-oauth/mcp-admission-http.mjs';
import {signBoundAccessToken} from
  '../services/orca-owned-oauth/bound-token.mjs';

const issuer='https://auth.orca.example';
const resource='https://mcp.orca.example/mcp';
const metadataUrl='https://mcp.orca.example/.well-known/oauth-protected-resource/mcp';
const clientId='https://chatgpt.com/oauth/client.json';
const ownerId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const grantId=randomUUID(),kid='stage8-test-es256-key';
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const mkToken=overrides=>signBoundAccessToken({
  issuer,resource,kid,privateKey,grant:{
    ownerId,grantId,clientId,scope:'orca:research.read',
    resource,active:true
  },...overrides
});
const call=(token,method='tools/call',name='orca_my_assignment',overrides={})=>
  new Request(resource,{
    method:'POST',headers:{
      'content-type':'application/json',
      ...(token?{'authorization':'Bearer '+token}:{}),
      ...(overrides.headers||{})
    },
    body:overrides.body||JSON.stringify({
      jsonrpc:'2.0',id:1,method,
      ...(method==='tools/call'?{params:{name,arguments:{}}}:{})
    })
  });
function setup({advertised=true,enabled=true,active=true}={}){
  let grantActive=active;
  const calls=[];
  const admit=createOwnedMcpAdmission({
    issuer,resource,metadataUrl,advertised,enabled,
    verifierOptions:{
      kid,publicKey,approvedClientIds:new Set([clientId]),
      currentGrant:async params=>{
        return grantActive&&params.ownerId===ownerId&&
          params.grantId===grantId&&params.clientId===clientId&&
          params.resource===resource&&params.scope==='orca:research.read';
      }
    },
    dispatchReadOnly:async data=>{
      calls.push(data);
      return new Response(JSON.stringify({jsonrpc:'2.0',id:data.rpc.id,
        result:{ok:true}}),{
        status:200,headers:{'content-type':'application/json'}
      });
    }
  });
  return {admit,calls,setActive:x=>grantActive=x};
}
test('default OFF does not advertise metadata or accept MCP tool calls',async()=>{
  const fn=createOwnedMcpAdmission({issuer,resource,metadataUrl});
  assert.equal((await fn(new Request(metadataUrl))).status,404);
  assert.equal((await fn(call(null))).status,503);
  assert.throws(()=>createOwnedMcpAdmission({
    issuer,resource,metadataUrl,enabled:true
  }),/unvetted_mcp_admission_configuration/);
});

test('Reject nonstandard OAuth protected resource discovery locations',()=>{
  assert.throws(()=>createOwnedMcpAdmission({
    issuer,resource,metadataUrl:'https://mcp.orca.example/mcp/oauth-protected-resource'
  }),/unvetted_mcp_admission_configuration/);
});

test('MCP discovery advertises only exact issuer, resource and read scope',async()=>{
  const {admit}=setup();
  const response=await admit(new Request(metadataUrl));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.resource,resource);
  assert.deepEqual(data.authorization_servers,[issuer]);
  assert.deepEqual(data.scopes_supported,['orca:research.read']);
  assert.ok(!JSON.stringify(data).includes('research.write'));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await admit(new Request(metadataUrl+'?key=secret'))).status,404);
});

test('absent or invalid bearer returns resource metadata challenge, no client data',async()=>{
  const {admit,calls}=setup();
  const r=await admit(call(null));
  assert.equal(r.status,401);
  assert.equal(r.headers.get('www-authenticate'),
    'Bearer resource_metadata="'+metadataUrl+'", scope="orca:research.read"');
  assert.deepEqual(await r.json(),{error:'authorization_required'});
  assert.equal((await admit(call('invalid.jwt.token'))).status,401);
  assert.equal(calls.length,0);
});

test('valid private grant allows only read-only MCP tool calls without forwarding bearer',async()=>{
  const {admit,calls}=setup();
  const bearer=mkToken();
  const r=await admit(call(bearer));
  assert.equal(r.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].ownerId,ownerId);
  assert.equal(calls[0].clientId,clientId);
  assert.equal(calls[0].grantId,grantId);
  assert.equal(calls[0].rpc.params.name,'orca_my_assignment');
  assert.ok(!JSON.stringify(calls[0]).includes(bearer));
  const list=await admit(call(bearer,'tools/list'));
  assert.equal(list.status,200);
  assert.equal(calls.length,2);
});

test('already-issued valid bearer becomes useless immediately after grant revocation',async()=>{
  const {admit,calls,setActive}=setup();
  const bearer=mkToken();
  assert.equal((await admit(call(bearer))).status,200);
  setActive(false);
  const denied=await admit(call(bearer));
  assert.equal(denied.status,401);
  assert.equal(calls.length,1,'revoked grant cannot reach the dispatcher');
});

test('wrong audience, unapproved tool, wrong content type and oversize requests deny',async()=>{
  const {admit,calls}=setup();
  const bearer=mkToken();
  const wrong=mkToken({
    resource:'https://different.example.invalid/mcp',
    grant:{ownerId,grantId,clientId,scope:'orca:research.read',
      resource:'https://different.example.invalid/mcp',active:true}
  });
  assert.equal((await admit(call(wrong))).status,401);
  assert.equal((await admit(call(bearer,'tools/call','orca_publish_finding'))).status,400);
  assert.equal((await admit(call(bearer,'resources/read'))).status,400);
  assert.equal((await admit(call(bearer,'tools/list',null,{
    headers:{'content-type':'text/plain'}
  }))).status,415);
  assert.equal((await admit(call(bearer,'tools/list',null,{
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',
      extra:'x'.repeat(17000)})
  }))).status,400);
  assert.equal(calls.length,0);
});
