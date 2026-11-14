import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash,randomBytes} from 'node:crypto';
import {createOrcaIssuerInteractionHttp} from
  '../services/orca-owned-oauth/interaction-http-routes.mjs';
import {createTrustedBrowserSession} from
  '../services/orca-owned-oauth/trusted-browser-session.mjs';
import {createExistingResearcherInteractionController} from
  '../services/orca-owned-oauth/existing-researcher-interaction.mjs';

const issuer='https://auth.orca.example';
const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const client='https://client.example.invalid/oauth.json';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const owner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const uid='interaction-uid-for-live-test-0001';
const accessToken='supabase.test.jwt';
const hash=s=>createHash('sha256').update(s).digest('base64url');

function fixture(){
  let prompt='login',oauthSession=null,userId=owner,verify=true;
  let loginCount=0,approveCount=0,denyCount=0,identityChecks=0;
  const challenges=new Map();
  const base={
    resource,clientId:client,callback,
    response_type:'code',scope:'openid orca:research.read',
    state:'s'.repeat(40),code_challenge:hash('x'.repeat(60)),
    code_challenge_method:'S256'
  };
  const provider={
    interactionDetails:async()=>({
      uid,
      params:{
        client_id:client,redirect_uri:callback,response_type:base.response_type,
        scope:base.scope,state:base.state,resource:base.resource,
        code_challenge:base.code_challenge,
        code_challenge_method:base.code_challenge_method
      },
      prompt:{name:prompt},session:oauthSession
    }),
    interactionFinished:async(_req,_res,result)=>{
      if(result.login){loginCount++;oauthSession={accountId:userId};}
      if(result.error==='access_denied')denyCount++;
    }
  };
  const auth={
    getUser:async supplied=>{
      identityChecks++;
      assert.equal(supplied,accessToken);
      return verify?{data:{user:{id:userId}}}:{error:Error('expired')};
    }
  };
  const sessionBridge=createTrustedBrowserSession({
    issuerOrigin:issuer,keyring:[{id:'stage7-session1',key:randomBytes(32)}],
    auth,ownerScopedProfileRead:async id=>({owner_id:id,opted_in:true}),
    isTrustedHttps:req=>req.verifiedTls===true
  });
  const controller=createExistingResearcherInteractionController({
    provider,supabaseAuth:auth,
    readTrustedBrowserSession:sessionBridge.readTrustedBrowserSession,
    ownerScopedProfileRead:async id=>({owner_id:id,opted_in:true}),
    approvedClients:{[client]:[callback]},resource,
    challenges:{
      async prepare({ownerId,clientId,interactionUid,browserSessionId}){
        const challengeId=randomBytes(16).toString('hex');
        const csrfToken=randomBytes(32).toString('base64url');
        challenges.set(challengeId,{
          ownerId,clientId,interactionUid,browserSessionId,csrfToken
        });
        return {challengeId,csrfToken};
      },
      async consume(input){
        const stored=challenges.get(input.challengeId);
        if(!stored||Object.keys(stored).some(k=>stored[k]!==input[k]))
          return false;
        challenges.delete(input.challengeId);
        return true;
      }
    }
  });
  const consentFinalizer={
    async finalize(req,res,form){
      if(form.decision!=='approve')throw Error('explicit_approval_required');
      await controller.consumeVerifiedConsent(req,res,form);
      approveCount++;
    }
  };
  const makeHandler=enabled=>createOrcaIssuerInteractionHttp({
    enabled,issuerOrigin:issuer,isTrustedHttps:req=>req.verifiedTls===true,
    sessionBridge,controller,consentFinalizer
  });
  return {
    handler:makeHandler(true),disabled:makeHandler(false),
    setPrompt:x=>prompt=x,
    setOwner:x=>userId=x,setVerify:x=>verify=x,
    stats:()=>({loginCount,approveCount,denyCount,identityChecks})
  };
}
async function send(handler,{
  method='GET',path='/interaction/'+uid,
  body='',cookie='',origin=issuer,host='auth.orca.example',
  type='application/x-www-form-urlencoded',tls=true,
  additionalHeaders={}
}={}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);
  Object.assign(req,{
    method,url:path,verifiedTls:tls,
    headers:{
      host,origin,'content-type':type,
      'sec-fetch-site':'same-origin',...(cookie?{cookie}:{}),
      ...additionalHeaders
    }
  });
  const res={
    status:0,headers:{},body:'',headersSent:false,writableEnded:false,
    writeHead(status,headers){
      this.status=status;this.headers=headers;this.headersSent=true;
    },
    end(chunk=''){this.body=String(chunk);this.writableEnded=true;}
  };
  await handler(req,res);
  return res;
}
async function signedIn(f){
  const boot=await send(f.handler,{
    method:'POST',path:'/session/bootstrap',
    type:'application/json',body:JSON.stringify({supabaseAccessToken:accessToken})
  });
  assert.equal(boot.status,204);
  assert.match(boot.headers['set-cookie'],/__Host-orca_oauth_session=/);
  return boot.headers['set-cookie'].split(';')[0];
}
function formFromHtml(html,decision){
  const field=name=>{
    const m=html.match(new RegExp('name="'+name+'" value="([^"]+)"'));
    assert.ok(m,'missing '+name);return m[1];
  };
  return new URLSearchParams({
    interactionUid:field('interactionUid'),
    challengeId:field('challengeId'),
    csrfToken:field('csrfToken'),
    decision
  }).toString();
}
test('disabled release gate rejects every route without issuing a session',async()=>{
  const f=fixture();
  const res=await send(f.disabled,{
    method:'POST',path:'/session/bootstrap',
    type:'application/json',body:JSON.stringify({supabaseAccessToken:accessToken})
  });
  assert.equal(res.status,503);
  assert.equal(f.stats().identityChecks,0);
});

test('existing ORCA researcher: secure same-origin bootstrap, human login, one-use CSRF',async()=>{
  const f=fixture();
  assert.equal((await send(f.handler)).status,403,'no cookie means no consent page');
  const cookie=await signedIn(f);
  const page=await send(f.handler,{cookie});
  assert.equal(page.status,200);
  assert.match(page.body,/Continue with my existing ORCA account/);
  assert.match(page.headers['content-security-policy'],/form-action 'self'/);
  assert.match(page.headers['x-frame-options'],/DENY/);
  assert.ok(!page.body.includes(accessToken));
  assert.ok(!page.body.includes(cookie));
  const form=formFromHtml(page.body,'continue');
  const ok=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/continue',
    cookie,body:form
  });
  assert.equal(ok.status,204);
  assert.equal(f.stats().loginCount,1);
  const replay=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/continue',
    cookie,body:form
  });
  assert.equal(replay.status,403);
  assert.equal(f.stats().loginCount,1);
});

test('consent page only authorizes exact read-only scope; wrong action and replay denied',async()=>{
  const f=fixture();
  const cookie=await signedIn(f);
  f.setPrompt('consent');
  const pre=await send(f.handler,{cookie});
  assert.equal(pre.status,403,'consent requires verified OAuth login session');
  // First complete the login, then return to consent prompt.
  f.setPrompt('login');
  const login=await send(f.handler,{cookie});
  await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/continue',
    cookie,body:formFromHtml(login.body,'continue')
  });
  f.setPrompt('consent');
  const page=await send(f.handler,{cookie});
  assert.equal(page.status,200);
  assert.match(page.body,/Approve read-only research/);
  assert.match(page.body,/No publishing, editing, or account administration/);
  assert.ok(!page.body.includes('orca:research.write'));
  const approve=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/approve',
    cookie,body:formFromHtml(page.body,'approve')
  });
  assert.equal(approve.status,204);
  assert.equal(f.stats().approveCount,1);
  const replay=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/approve',
    cookie,body:formFromHtml(page.body,'approve')
  });
  assert.equal(replay.status,403);
  const mismatch=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/approve',
    cookie,body:new URLSearchParams({
      interactionUid:uid,challengeId:'abc',csrfToken:'bad',decision:'deny'
    }).toString()
  });
  assert.equal(mismatch.status,403);
  assert.equal(f.stats().approveCount,1);
});

test('forged origin, untrusted TLS, malicious body, and bearer are rejected',async()=>{
  const f=fixture();
  const cookie=await signedIn(f);
  const page=await send(f.handler,{cookie});
  const body=formFromHtml(page.body,'continue');
  for(const bad of [
    {origin:'https://attacker.invalid'},
    {host:'evil.orca.example'},
    {tls:false},
    {additionalHeaders:{'sec-fetch-site':'cross-site'}},
    {additionalHeaders:{authorization:'Bearer attacker'}},
    {type:'text/plain'},
    {body:body+'&csrfToken=duplicate'},
    {body:body+'&role=admin'},
    {body:body+'x'.repeat(9000)}
  ]){
    const outcome=await send(f.handler,{
      method:'POST',path:'/interaction/'+uid+'/continue',cookie,body,...bad
    });
    assert.equal(outcome.status,403);
  }
  assert.equal(f.stats().loginCount,0);
  const missing=await send(f.handler,{cookie,path:'/interaction/'+uid+'?token=secret'});
  assert.equal(missing.status,404);
});

test('user switch after rendering the page cannot authorize an agent',async()=>{
  const f=fixture();
  const cookie=await signedIn(f);
  const page=await send(f.handler,{cookie});
  f.setOwner('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff');
  const attempt=await send(f.handler,{
    method:'POST',path:'/interaction/'+uid+'/continue',
    cookie,body:formFromHtml(page.body,'continue')
  });
  assert.equal(attempt.status,403);
  assert.equal(f.stats().loginCount,0);
});

test('displayed client/resource values are escaped, with no HTML script execution',async()=>{
  const f=fixture();
  const synthetic=createOrcaIssuerInteractionHttp({
    enabled:true,issuerOrigin:issuer,
    isTrustedHttps:req=>req.verifiedTls===true,
    sessionBridge:{issueSessionCookie:async()=>{},
      readTrustedBrowserSession:async()=>{}},
    controller:{
      prepare:async()=>({
        prompt:'consent',interactionUid:uid,
        clientId:'<script>alert(1)</script>',
        scope:'orca:research.read',resource:'https://evil.example?a=1&b=2',
        challengeId:'abc',csrfToken:'def'
      }),
      continueVerifiedLogin:async()=>{},denyWithVerifiedSession:async()=>{}
    },
    consentFinalizer:{finalize:async()=>{}}
  });
  const res=await send(synthetic);
  assert.equal(res.status,200);
  assert.ok(res.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!res.body.includes('<script>'));
  assert.match(res.headers['content-security-policy'],/default-src 'none'/);
});
