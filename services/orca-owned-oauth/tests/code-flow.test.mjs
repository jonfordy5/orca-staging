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
import {verifyBoundAccessToken} from '../bound-token.mjs';
import {createOpaqueBrowserSessionBridge} from '../opaque-browser-session.mjs';
import {createOrcaIssuerInteractionHttp} from '../interaction-http-routes.mjs';

const RESOURCE='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const CLIENT='orca-ephemeral-code-test-client';
const CALLBACK='https://example.invalid/orca-callback';
const OWNER='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CHALLENGE_SCOPE='openid orca:research.read';
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
// This integration uses the real Stage 7 HTML form/CSRF router, not a
// custom fixture approval handler. HTTPS authority is simulated only inside
// the 127.0.0.1 test shim; NEVER enable this translation in production.
function parseHumanInteractionPage(markup){
  assert.match(markup,/<!doctype html>/i);
  assert.doesNotMatch(markup,/fake\.supabase\.jwt/);
  const uid=markup.match(/action="\/interaction\/([A-Za-z0-9._~-]+)\/(?:continue|approve)"/)?.[1];
  const field=name=>markup.match(
    new RegExp('name="'+name+'" value="([^"]+)"')
  )?.[1];
  assert.ok(uid&&field('challengeId')&&field('csrfToken')&&
    field('interactionUid')===uid,'trusted HTML interaction fields required');
  return {interactionUid:uid,challengeId:field('challengeId'),
    csrfToken:field('csrfToken')};
}

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
  // TEST-ONLY integration: actual encrypted opaque session logic against an
  // ephemeral in-memory store, while OAuth itself runs over loopback HTTP.
  // The fake HTTPS trust callback/host override are local fixture adapters,
  // NEVER production behavior. No real Supabase account or token is used.
  const privateSessionRecords=new Map();
  const privateSessionStore={
    async create(row){
      const k=row.sessionHash.toString('hex');
      if(privateSessionRecords.has(k))return false;
      privateSessionRecords.set(k,{...row});return true;
    },
    async find(hash){return privateSessionRecords.get(hash.toString('hex'))||null;},
    async revoke(hash){return privateSessionRecords.delete(hash.toString('hex'));}
  };
  const sessionOrigin='https://auth.orca.example';
  const sessionBridge=createOpaqueBrowserSessionBridge({
    issuerOrigin:sessionOrigin,
    keyring:[{id:'integration-key-0001',key:randomBytes(32)}],
    store:privateSessionStore,
    auth:{async getUser(token){
      assert.equal(token,SUPABASE_FIXTURE_BEARER);
      return {data:{user:{id:OWNER}}};
    }},
    ownerScopedProfileRead:async id=>({owner_id:id,opted_in:id===OWNER}),
    isTrustedHttps:()=>true
  });
  const bootstrap=await sessionBridge.issueSessionCookie({
    method:'POST',
    headers:{host:'auth.orca.example',origin:sessionOrigin,
      'content-type':'application/json'}
  },{supabaseAccessToken:SUPABASE_FIXTURE_BEARER});
  const testOpaqueCookie=bootstrap.setCookie.split(';')[0];
  assert.match(testOpaqueCookie,/^__Host-orca_oauth_session=[A-Za-z0-9_-]{43}$/);
  assert.ok(!testOpaqueCookie.includes(SUPABASE_FIXTURE_BEARER));
  const controller=createExistingResearcherInteractionController({
    provider,
    supabaseAuth:{async getUser(token){
      assert.equal(token,SUPABASE_FIXTURE_BEARER);
      return {data:{user:{id:OWNER}}};
    }},
    // Loopback test adapter maps only the test's local HTTP Host to the
    // synthetic HTTPS issuer; the bridge still verifies the real cookie.
    readTrustedBrowserSession:async req=>
      sessionBridge.readTrustedBrowserSession({
        method:req.method,
        headers:{...req.headers,host:'auth.orca.example'}
      }),
    ownerScopedProfileRead:async id=>({
      owner_id:id,opted_in:id===OWNER
    }),
    challenges,approvedClients:{[CLIENT]:[CALLBACK]},resource:RESOURCE
  });
  const finalizer=createSafeConsentFinalizer({
    controller,provider,grantRegistry:grants,resource:RESOURCE
  });
  const routeProvider=provider.callback();
  const humanRoutes=createOrcaIssuerInteractionHttp({
    enabled:true,issuerOrigin:sessionOrigin,
    isTrustedHttps:()=>true, // TEST ONLY: no real TLS on local loopback
    sessionBridge,controller,consentFinalizer:finalizer
  });
  const server=createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,issuer);
      if(u.pathname.startsWith('/interaction/')||
         u.pathname==='/session/bootstrap'){
        // TEST ONLY. Real HTTPS must use the true TLS socket and Host
        // as supplied by the approved public issuer, not a rewrite.
        req.headers.host='auth.orca.example';
        await humanRoutes(req,res);
        return;
      }
      routeProvider(req,res);
    }catch{
      if(!res.headersSent){
        res.writeHead(403,{'content-type':'application/json'});
        res.end('{"error":"test_interaction_unavailable"}');
      }
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolve);
  });
  return {
    issuer,grants,db,publicKey,kid,testOpaqueCookie,sessionBridge,
    close:()=>new Promise(resolve=>server.close(resolve))
  };
}
async function call(origin,jar,path,{method='GET',body:data}={}){
  const headers={cookie:requestCookies(jar)};
  if(data){
    headers['content-type']='application/x-www-form-urlencoded';
    // Browser-only login/consent submissions carry exact same-origin
    // provenance. The separate OAuth /token request is not a browser
    // consent form; oidc-provider must reject cross-origin token POSTs.
    if(new URL(path,origin).pathname.startsWith('/interaction/')){
      headers.origin='https://auth.orca.example'; // synthetic test origin
      headers['sec-fetch-site']='same-origin';
    }
  }
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
  const [cookieName,cookieValue]=fixture.testOpaqueCookie.split('=');
  const jar=new Map([[cookieName,cookieValue]]);
  assert.ok(!fixture.testOpaqueCookie.includes(SUPABASE_FIXTURE_BEARER));
  // ChatGPT's stable callback requires RFC 9207 support. Detect whether
  // our pinned issuer truly advertises it instead of assuming support.
  const metadataResponse=await call(fixture.issuer,jar,
    '/.well-known/oauth-authorization-server');
  assert.equal(metadataResponse.status,200);
  const metadata=await metadataResponse.json();
  assert.equal(metadata.issuer,fixture.issuer);
  assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  const advertisesIssuerId=metadata.authorization_response_iss_parameter_supported===true;
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
  // Real-library negative authorization cases: no unregistered redirect
  // or unknown client may initiate an interactive code flow.
  const badRedirect=new URLSearchParams(args);
  badRedirect.set('redirect_uri','https://attacker.example.invalid/callback');
  const rejectedRedirect=await call(fixture.issuer,jar,'/auth?'+badRedirect);
  assert.equal(rejectedRedirect.status,400,'Unregistered OAuth callback must fail');
  const badClient=new URLSearchParams(args);
  badClient.set('client_id','not-registered-client');
  const rejectedClient=await call(fixture.issuer,jar,'/auth?'+badClient);
  assert.equal(rejectedClient.status,400,'Unregistered OAuth client must fail');
  let r=await call(fixture.issuer,jar,'/auth?'+args);
  if(![302,303].includes(r.status)){
    const html=await r.text();
    const errorFields=html.match(/<pre>[\s\S]*?<\/pre>/g)||[];
    assert.fail('Authorization request status '+r.status+': '+errorFields.join(' ').slice(0,1200));
  }
  let next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.equal(next.response.status,200);
  let html=await next.response.text();
  assert.match(html,/Continue to ORCA/);
  assert.match(html,/orca:research\.read/);
  let page=parseHumanInteractionPage(html);

  // Browser-origin guard rejects a forged POST without consuming consent.
  const crossSite=await fetch(new URL('/interaction/'+page.interactionUid+
    '/continue',fixture.issuer),{
      method:'POST',headers:{
        cookie:requestCookies(jar),
        'content-type':'application/x-www-form-urlencoded',
        origin:'https://evil.example.invalid'
      },body:new URLSearchParams({
        ...page,decision:'continue'
      }),redirect:'manual'
    });
  assert.equal(crossSite.status,403);

  r=await call(fixture.issuer,jar,
    '/interaction/'+page.interactionUid+'/continue',{
      method:'POST',body:{...page,decision:'continue'}
    });
  assert.ok([302,303].includes(r.status),'Verified login must resume provider');
  next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.equal(next.response.status,200);
  html=await next.response.text();
  assert.match(html,/Authorize ORCA research access/);
  assert.match(html,/Approve read-only research/);
  assert.match(html,/No publishing, editing, or account administration/);
  assert.doesNotMatch(html,/orca:research\.write/);
  page=parseHumanInteractionPage(html);

  r=await call(fixture.issuer,jar,
    '/interaction/'+page.interactionUid+'/approve',{
      method:'POST',body:{...page,decision:'approve'}
    });
  assert.ok([302,303].includes(r.status),
    'Explicit consent response '+r.status+': '+(await r.text()).slice(0,750));
  next=await proceed(fixture.issuer,jar,r.headers.get('location'));
  assert.ok(next.external,'Successful code flow must return to exact registered callback');
  assert.equal(next.external.origin,new URL(CALLBACK).origin);
  const code=next.external.searchParams.get('code');
  assert.ok(code && code.length>12);
  assert.equal(next.external.searchParams.get('state'),'s'.repeat(45));
  const callbackIssuer=next.external.searchParams.get('iss');
  if(advertisesIssuerId){
    assert.equal(callbackIssuer,fixture.issuer,
      'RFC 9207 metadata claims must match callback iss exactly');
    console.log('PASS RFC 9207 issuer identification: stable callback may be eligible.');
  }else{
    assert.equal(callbackIssuer,null,
      'Unadvertised issuer identification must not be assumed');
    console.log('CHATGPT BLOCKER: RFC 9207 not advertised; use management-page '+
      'callback-ID redirect, not an assumed stable callback.');
  }

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
  assert.equal(response.refresh_token,undefined,'Refresh issuance must remain disabled');
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

  console.log('LOCAL JWT FORMAT',JSON.stringify({
    typ:head.typ,kid:head.kid,jtiType:typeof claims.jti,
    jtiLength:typeof claims.jti==='string'?claims.jti.length:null,
    ttlSeconds:claims.exp-claims.iat
  }));
  const verifierOptions={
    issuer:fixture.issuer,resource:RESOURCE,kid:fixture.kid,
    publicKey:fixture.publicKey,approvedClientIds:new Set([CLIENT]),
    currentGrant:fixture.grants.isCurrentGrant
  };
  const accepted=await verifyBoundAccessToken(response.access_token,verifierOptions);
  assert.equal(accepted.ok,true,'MCP JWT verification rejected real OAuth token: '+accepted.reason);
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
  const rejected=await verifyBoundAccessToken(response.access_token,verifierOptions);
  assert.equal(rejected.ok,false);
  assert.equal(rejected.reason,'grant_revoked_or_mismatched');
  const replay=await call(fixture.issuer,jar,'/token',{
    method:'POST',body:tokenRequest
  });
  assert.notEqual(replay.status,200,'Authorization code must not be reusable');
  console.log('PASS real oidc-provider code+S256 PKCE -> verified fixture owner -> explicit consent -> ES256 resource-bound signed JWT -> immediate ORCA grant revocation');
});
