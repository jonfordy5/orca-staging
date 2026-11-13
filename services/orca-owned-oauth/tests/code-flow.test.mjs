// Offline-only actual authorization-code + PKCE protocol integration harness.
// NEVER import this file into public code or deploy its mock identity handler.
// All signing keys, consent sessions, OAuth clients and identities are
// ephemeral fixture values. No Supabase project, user or network dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import Provider from 'oidc-provider';
import {createServer} from 'node:http';
import {createServer as createNetServer} from 'node:net';
import {generateKeyPairSync,randomBytes,createHash,createVerify} from 'node:crypto';
import {buildOidcProviderProposal} from '../oidc-provider-proposal.mjs';
import {createExistingResearcherInteractionController} from '../existing-researcher-interaction.mjs';
import {createSafeConsentFinalizer} from '../consent-finalization.mjs';
import {createPrivateConsentChallenges} from '../consent-challenge.mjs';
import {createOwnedGrantRegistry} from '../grant-registry.mjs';

const RESOURCE='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const CLIENT='orca-ephemeral-code-test-client';
const CALLBACK='https://example.invalid/orca-callback';
const OWNER='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CHALLENGE_SCOPE='openid orca:research.read';
const TEST_BROWSER_SESSION='test-browser-session-00000000000001';
const SUPABASE_FIXTURE_BEARER='fake.supabase.jwt';

const sha=x=>createHash('sha256').update(x,'utf8').digest('base64url');
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const captureCookies=(jar,response)=>{
  const all=typeof response.headers.getSetCookie==='function'
    ?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
  for(const c of all){
    const raw=c.split(';',1)[0];
    const i=raw.indexOf('=');
    if(i<1)continue;
    const k=raw.slice(0,i),v=raw.slice(i+1);
    if(v==='')jar.delete(k);else jar.set(k,v);
  }
};
const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));

// Minimal persistence simulation, used only for in-process protocol tests.
// Real deployment must use the encrypted PostgreSQL adapter tested elsewhere.
const stored=new Map();
class MemoryOidcAdapter{
  constructor(model){this.model=model;}
  key(id){return this.model+':'+id;}
  async upsert(id,payload,ttl){
    stored.set(this.key(id),{
      payload:{...payload},exp:Date.now()+ttl*1000,consumed:null
    });
  }
  async find(id){
    const r=stored.get(this.key(id));
    if(!r||r.exp<=Date.now())return undefined;
    return {...r.payload,...(r.consumed?{consumed:r.consumed}:{})};
  }
  async findByUid(uid){
    for(const [key,r] of stored){
      if(key.startsWith(this.model+':')&&r.payload.uid===uid &&
        r.exp>Date.now())return {...r.payload};
    }
    return undefined;
  }
  async findByUserCode(){return undefined;}
  async consume(id){
    const r=stored.get(this.key(id));
    if(!r||r.consumed||r.exp<=Date.now())throw Error('code_replay');
    r.consumed=Date.now();
  }
  async destroy(id){stored.delete(this.key(id));}
  async revokeByGrantId(id){
    for(const [key,r] of stored)
      if(key.startsWith(this.model+':')&&r.payload.grantId===id)
        stored.delete(key);
  }
}

function fakePrivateDatabase(){
  const consents=new Map(),grants=new Map();
  const query=async(sql,args)=>{
    if(sql.includes('orca_owned_oauth_private.consent_challenges')){
      if(sql.startsWith('insert')){
        const [id,owner,client,resource,interaction,session,csrf,seconds]=args;
        consents.set(id,{owner,client,resource,interaction,session,csrf,
          expiresAt:Date.now()+seconds*1000,consumed:false});
        return {rowCount:1,rows:[{id}]};
      }
      const [id,owner,client,resource,interaction,session,csrf]=args;
      const r=consents.get(id);
      if(!r||r.consumed||r.expiresAt<=Date.now()||r.owner!==owner||
        r.client!==client||r.resource!==resource||
        !same(r.interaction,interaction)||!same(r.session,session)||
        !same(r.csrf,csrf))return {rowCount:0,rows:[]};
      r.consumed=true;
      return {rowCount:1,rows:[{id}]};
    }
    if(sql.includes('orca_owned_oauth_private.grants')){
      if(sql.startsWith('insert')){
        const [id,owner,client,resource,scope,expiry]=args;
        grants.set(id,{id,owner,client,resource,scope,expiry,provider:null,revoked:false});
        return {rowCount:1,rows:[{id}]};
      }
      if(sql.includes('set provider_grant_hash=')){
        const [id,owner,client,hash,resource,scope]=args,r=grants.get(id);
        if(!r||r.owner!==owner||r.client!==client||r.provider||r.revoked||
          r.resource!==resource||r.scope!==scope)return {rowCount:0,rows:[]};
        r.provider=Buffer.from(hash);return {rowCount:1,rows:[{id}]};
      }
      if(sql.startsWith('select id from')){
        const [hash,owner,client,resource,scope]=args;
        const r=[...grants.values()].find(x=>x.provider&&
          same(x.provider,hash)&&x.owner===owner&&x.client===client&&
          x.resource===resource&&x.scope===scope&&!x.revoked&&
          Date.parse(x.expiry)>Date.now());
        return r?{rowCount:1,rows:[{id:r.id}]}:{rowCount:0,rows:[]};
      }
      if(sql.startsWith('select 1 as active')){
        const [id,owner,client,resource,scope]=args,r=grants.get(id);
        const ok=r&&r.owner===owner&&r.client===client&&
          r.resource===resource&&r.scope===scope&&!r.revoked&&
          Date.parse(r.expiry)>Date.now();
        return ok?{rowCount:1,rows:[{active:1}]}:{rowCount:0,rows:[]};
      }
      if(sql.startsWith('update')&&sql.includes('set revoked_at=')){
        const [id,owner]=args,r=grants.get(id);
        if(!r||r.owner!==owner||r.revoked)return {rowCount:0,rows:[]};
        r.revoked=true;return {rowCount:1,rows:[{id}]};
      }
    }
    throw Error('unexpected_private_sql');
  };
  return {query,grants};
}

function requestCookies(jar){
  return [...jar.entries()].map(([k,v])=>k+'='+v).join('; ');
}
const body=async req=>{
  let s='';
  for await(const chunk of req){
    s+=chunk.toString('utf8');
    if(s.length>16384)throw Error('oversized_test_form');
  }
  return Object.fromEntries(new URLSearchParams(s));
};
const json=(res,status,payload)=>{
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
};

async function freePort(){
  return new Promise((resolve,reject)=>{
    const s=createNetServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{
      const port=s.address().port;s.close(()=>resolve(port));
    });
  });
}
async function startFixture(){
  const port=await freePort();
  const issuer='http://127.0.0.1:'+port;
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const kid='local-ephemeral-key-0001';
  const db=fakePrivateDatabase();
  const grants=createOwnedGrantRegistry({query:db.query,resource:RESOURCE});
  const challenges=createPrivateConsentChallenges({query:db.query,resource:RESOURCE});
  const config=buildOidcProviderProposal({
    resource:RESOURCE,clientId:CLIENT,redirectUri:CALLBACK,kid,
    findAccount:async (_ctx,id)=>id===OWNER?{
      accountId:id,claims:async()=>({sub:id})
    }:undefined,
    persistentAdapter:MemoryOidcAdapter,
    interactionUrl:'/interaction/test',
    lookupOwnedGrant:grants.lookupOwnedGrant
  });
  config.interactions={url:(_ctx,interaction)=>'/interaction/'+interaction.uid};
  config.jwks={keys:[{
    ...privateKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'
  }]};
  config.cookies={keys:[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')]};
  config.ttl={AccessToken:300};
  const provider=new Provider(issuer,config);
  provider.on('server_error',(_ctx,error)=>{
    console.log('LOCAL TEST PROVIDER ERROR',String(error?.message||error).slice(0,250));
    console.log('LOCAL TEST PROVIDER ERROR CLASS',String(error?.name||'').slice(0,100));
  });
  const providerDetails=provider.interactionDetails.bind(provider);
  provider.interactionDetails=async (...args)=>{
    const details=await providerDetails(...args);
    if(details?.prompt?.name==='consent'){
      const d=details.prompt.details||{};
      console.log('LOCAL CONSENT SHAPE',JSON.stringify({
        missingOIDCScope:d.missingOIDCScope,
        missingResourceScopes:d.missingResourceScopes,
        missingOIDCClaims:d.missingOIDCClaims,
        rar:d.rar
      }).slice(0,700));
    }
    return details;
  };
  const controller=createExistingResearcherInteractionController({
    provider,
    supabaseAuth:{async getUser(token){
      assert.equal(token,SUPABASE_FIXTURE_BEARER);
      return {data:{user:{id:OWNER}}};
    }},
    // TEST-ONLY fixture: a signed browser session is simulated by a cookie
    // pinned to one synthetic test owner; no real account token is supplied.
    readTrustedBrowserSession:async(req)=>{
      const present=(req.headers.cookie||'').split(';').some(x=>
        x.trim()==='fixture_signed_session='+TEST_BROWSER_SESSION);
      if(!present)throw Error('no_fixture_browser_session');
      return {supabaseAccessToken:SUPABASE_FIXTURE_BEARER,
        browserSessionId:TEST_BROWSER_SESSION};
    },
    ownerScopedProfileRead:async id=>({
      owner_id:id,opted_in:id===OWNER
    }),
    challenges,approvedClients:{[CLIENT]:[CALLBACK]},resource:RESOURCE
  });
  const finalizer=createSafeConsentFinalizer({
    controller,provider,grantRegistry:grants,resource:RESOURCE
  });
  const routeProvider=provider.callback();
  const server=createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,issuer),parts=u.pathname.split('/');
      if(parts[1]==='interaction'&&parts[2]&&parts.length>=3){
        const interactionUid=parts[2];
        if(req.method==='GET'&&parts.length===3){
          const page=await controller.prepare(req,res,{interactionUid});
          json(res,200,page);
          return;
        }
        if(req.method==='POST'&&parts.length===4){
          const data=await body(req);
          data.interactionUid=interactionUid;
          if(parts[3]==='login'){
            await controller.continueVerifiedLogin(req,res,data);
            return;
          }
          if(parts[3]==='approve'){
            await finalizer.finalize(req,res,data);
            return;
          }
          if(parts[3]==='deny'){
            await controller.denyWithVerifiedSession(req,res,{
              ...data,expectedPrompt:'consent'
            });
            return;
          }
        }
        json(res,405,{error:'unsupported_fixture_action'});
        return;
      }
      routeProvider(req,res);
    }catch(e){
      if(!res.headersSent)
        json(res,403,{error:e?.message||'unauthorized'});
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return {
    issuer,grants,db,publicKey,kid,
    close:()=>new Promise(resolve=>server.close(resolve))
  };
}
async function call(origin,jar,path,{method='GET',body:data}={}){
  const headers={cookie:requestCookies(jar)};
  if(data)headers['content-type']='application/x-www-form-urlencoded';
  const r=await fetch(new URL(path,origin),{
    method,headers,
    ...(data?{body:new URLSearchParams(data)}:{}),
    redirect:'manual',
    signal:AbortSignal.timeout(8000)
  });
  captureCookies(jar,r);
  return r;
}
async function proceed(origin,jar,location){
  let url=new URL(location,origin);
  if(url.origin!==origin)return {external:url};
  const response=await call(origin,jar,url.pathname+url.search);
  if(response.status>=300&&response.status<400)
    return proceed(origin,jar,response.headers.get('location'));
  return {response,url};
}

test('Real local OAuth authorization-code PKCE + Supabase-fixture consent + linked ORCA grant',async t=>{
  const fixture=await startFixture();
  t.after(()=>fixture.close());
  const jar=new Map([['fixture_signed_session',TEST_BROWSER_SESSION]]);
  const verifier=randomBytes(32).toString('base64url');
  const challenge=sha(verifier);
  const args=new URLSearchParams({
    response_type:'code',
    client_id:CLIENT,
    redirect_uri:CALLBACK,
    scope:CHALLENGE_SCOPE,
    resource:RESOURCE,
    state:'s'.repeat(45),
    code_challenge_method:'S256',
    code_challenge:challenge
  });
  let r=await call(fixture.issuer,jar,'/auth?'+args);
  if(![302,303].includes(r.status)){
    const html=await r.text();
    const errorFields=html.match(/<pre>[\s\S]*?<\/pre>/g)||[];
    assert.fail('Authorization request status '+r.status+': '+errorFields.join(' ').slice(0,1200));
  }
  let next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.equal(next.response.status,200);
  let page=await next.response.json();
  assert.equal(page.prompt,'login');
  assert.equal(page.resource,RESOURCE);

  r=await call(fixture.issuer,jar,
    '/interaction/'+page.interactionUid+'/login',{
      method:'POST',body:{
        challengeId:page.challengeId,csrfToken:page.csrfToken
      }
    });
  assert.ok([302,303].includes(r.status),'Verified login must resume provider');
  next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.equal(next.response.status,200);
  page=await next.response.json();
  assert.equal(page.prompt,'consent');

  r=await call(fixture.issuer,jar,
    '/interaction/'+page.interactionUid+'/approve',{
      method:'POST',body:{
        challengeId:page.challengeId,
        csrfToken:page.csrfToken,
        decision:'approve'
      }
    });
  assert.ok([302,303].includes(r.status),
    'Explicit consent response '+r.status+': '+(await r.text()).slice(0,750));
  next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.ok(next.external,'Successful code flow must return to exact registered callback');
  assert.equal(next.external.origin,new URL(CALLBACK).origin);
  const code=next.external.searchParams.get('code');
  assert.ok(code && code.length>12);
  assert.equal(next.external.searchParams.get('state'),'s'.repeat(45));

  const tokenRequest={
    grant_type:'authorization_code',code,
    client_id:CLIENT,redirect_uri:CALLBACK,code_verifier:verifier,
    resource:RESOURCE
  };
  const token=await call(fixture.issuer,jar,'/token',{
    method:'POST',body:tokenRequest
  });
  const response=await token.json();
  assert.equal(token.status,200,'Expected real PKCE token exchange: '+JSON.stringify(response));
  assert.ok(response.access_token);
  const parts=response.access_token.split('.');
  assert.equal(parts.length,3,'Resource-indicator token should be JWT');
  const head=JSON.parse(Buffer.from(parts[0],'base64url'));
  const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  assert.equal(head.alg,'ES256');
  assert.equal(claims.iss,fixture.issuer);
  assert.equal(claims.aud,RESOURCE);
  assert.equal(claims.sub,OWNER);
  assert.equal(claims.client_id,CLIENT);
  assert.ok(claims.grant_id);
  assert.equal(claims.scope,'orca:research.read');
  const sig=createVerify('SHA256');
  sig.update(parts[0]+'.'+parts[1]);sig.end();
  assert.equal(sig.verify({key:fixture.publicKey,dsaEncoding:'ieee-p1363'},
    Buffer.from(parts[2],'base64url')),true);

  assert.equal(await fixture.grants.isCurrentGrant({
    grantId:claims.grant_id,ownerId:OWNER,clientId:CLIENT,
    resource:RESOURCE,scope:'orca:research.read'
  }),true);
  await fixture.grants.revokeGrant({
    grantId:claims.grant_id,verifiedOwnerId:OWNER
  });
  assert.equal(await fixture.grants.isCurrentGrant({
    grantId:claims.grant_id,ownerId:OWNER,clientId:CLIENT,
    resource:RESOURCE,scope:'orca:research.read'
  }),false);
  const replay=await call(fixture.issuer,jar,'/token',{
    method:'POST',body:tokenRequest
  });
  assert.notEqual(replay.status,200,'Authorization code must not be reusable');
  console.log('PASS real oidc-provider code+S256 PKCE -> verified fixture owner -> explicit consent -> ES256 resource-bound signed JWT -> immediate ORCA grant revocation');
});
