import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  readGrants,listOwnedGrants,revokeOwnedGrant
} from '../agent-grant-control.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const grant=(id='client-1')=>({
  client:{id,name:'ChatGPT Read Only',uri:'https://chatgpt.com',logo_uri:''},
  scopes:['openid','profile'],granted_at:'2026-11-12T10:00:00Z'
});

test('valid native Supabase grant data includes only provider-returned identity',()=>{
  const normalized=readGrants([grant()]);
  assert.deepEqual(normalized,[{
    id:'client-1',name:'ChatGPT Read Only',
    scopes:['openid','profile'],grantedAt:'2026-11-12T10:00:00Z'
  }]);
  assert.deepEqual(readGrants([]),[]);
});

test('invalid/ambiguous grant responses never appear as an empty successful list',()=>{
  for(const bad of [undefined,null,{},true,'', {grants:[]},
    [null],[{}],[{client:null,scopes:[]}],
    [{client:{id:'id',name:'name'},scopes:'openid'}],
    [{client:{id:'id',name:'name'},scopes:[null]}],
    [grant('duplicate'),grant('duplicate')]]) {
    assert.throws(()=>readGrants(bad));
  }
});

test('grant metadata cannot inject raw markup into rendered HTML',()=>{
  const page=readFileSync(join(root,'agent-connections.html'),'utf8');
  assert.match(page,/\.textContent=String\(text\)/);
  assert.doesNotMatch(page,/\.innerHTML\s*=|insertAdjacentHTML\(/);
  assert.match(page,/id="signin"/);
  assert.match(page,/id="refresh"/);
  assert.match(page,/Confirm Disconnect/);
  assert.match(page,/if\(busy\|\|id!==pendingId/);
});

test('listGrants errors and malformed response fail closed',async()=>{
  await assert.rejects(()=>listOwnedGrants({listGrants:async()=>({data:null,error:new Error('not enabled')})}));
  await assert.rejects(()=>listOwnedGrants({listGrants:async()=>({data:null,error:null})}));
  await assert.rejects(()=>listOwnedGrants({listGrants:async()=>({error:null})}));
  await assert.rejects(()=>listOwnedGrants({}));
});

test('Disconnect only revokes a client present in fresh signed-in account grants',async()=>{
  const calls=[];
  let authorized=[grant('client-A'),grant('client-B')];
  const api={
    async listGrants(){calls.push('list');return {data:authorized,error:null}},
    async revokeGrant(options){
      calls.push(['revoke',options]);
      authorized=authorized.filter(g=>g.client.id!==options.clientId);
      return {data:{},error:null};
    }
  };
  const after=await revokeOwnedGrant(api,'client-A');
  assert.deepEqual(calls,['list',['revoke',{clientId:'client-A'}],'list']);
  assert.deepEqual(after.map(g=>g.id),['client-B']);
  await assert.rejects(()=>revokeOwnedGrant(api,'not-listed'));
  assert.equal(calls.filter(x=>Array.isArray(x)).length,1,
    'unlisted client must not cause any revocation');
});

test('Revocation cannot claim success when provider still reports the grant',async()=>{
  const api={
    listGrants:async()=>({data:[grant()],error:null}),
    revokeGrant:async()=>({data:{},error:null})
  };
  await assert.rejects(()=>revokeOwnedGrant(api,'client-1'),
    /Revocation could not be verified/);
});

test('Revocation fails without calling backend if list is unavailable',async()=>{
  let called=false;
  const api={
    listGrants:async()=>({data:null,error:new Error('disconnected')}),
    revokeGrant:async()=>{called=true;return {data:{},error:null}}
  };
  await assert.rejects(()=>revokeOwnedGrant(api,'client-1'));
  assert.equal(called,false);
});

test('Revocation errors cannot be described as a successful Disconnect',async()=>{
  const api={
    listGrants:async()=>({data:[grant()],error:null}),
    revokeGrant:async()=>({data:null,error:new Error('not authorized')})
  };
  await assert.rejects(()=>revokeOwnedGrant(api,'client-1'),
    /Revocation failed/);
});

test('Page compiles and requires verified session before listing or revoke',()=>{
  const page=readFileSync(join(root,'agent-connections.html'),'utf8');
  const script=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
  assert.ok(script.length>3000);
  const executable=script.replace(/^import[^\n]*$/gm,'');
  assert.doesNotThrow(()=>new Function(executable));
  assert.ok(script.includes('const session=await sb.auth.getUser()'));
  assert.ok(script.includes('const next=await listOwnedGrants(sb.auth.oauth)'));
  assert.ok(script.includes('const after=await revokeOwnedGrant(sb.auth.oauth,id)'));
  assert.ok(script.includes('if(!await verifyOwner())throw'));
  assert.ok(script.includes('grantsKnown=false'));
  assert.ok(script.includes('confirm')||script.includes('Confirm Disconnect'));
  assert.ok(script.includes('oauth.listGrants')===false,'use isolated SDK grant adapter');
  assert.doesNotMatch(script,/approveAuthorization\(|signInWithOAuth\(|client_secret|access_token\s*=|setItem\(/);
});

test('Only exact allowlisted account return can reopen AI connections',()=>{
  const account=readFileSync(join(root,'account.html'),'utf8');
  assert.match(account,/'agent-connections\.html'\]\.includes\(returnTo\)/);
  assert.match(account,/stagingReturnTo==='agent-connections\.html'/);
  assert.match(account,/orcaStagingHref\('\.\/'\+stagingReturnTo,\{ticker\}\)/);
  const connect=readFileSync(join(root,'connect-work.html'),'utf8');
  assert.match(connect,/id="connections-settings"/);
  assert.match(connect,/orcaStagingHref\('\.\/agent-connections\.html',\{ticker\}\)/);
});

test('No connection or publication is falsely claimed before OAuth is enabled',()=>{
  const page=readFileSync(join(root,'agent-connections.html'),'utf8');
  assert.match(page,/OAuth account linking is still in development/);
  assert.match(page,/Nothing was connected or disconnected/);
  assert.doesNotMatch(page,/\.rpc\(|\.insert\(|\.upsert\(|\.delete\(|\.update\(/);
  assert.doesNotMatch(page,/revokeResearchConsent|stopResearch|claimNextResearch/);
});
