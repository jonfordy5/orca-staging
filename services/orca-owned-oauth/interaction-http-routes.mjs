// ORCA-owned OAuth Stage 7: human-facing, fail-closed interaction HTTP adapter.
// CODE ONLY. There is no listener, public route, OAuth client approval, or
// issuer activation in this module. The caller must provide real TLS, host,
// secure session store, Supabase Auth, issuer and restricted Postgres bindings.
// Never accept a user identity, alias, scope or token from an OAuth agent.
const INTERACTION=/^\/interaction\/([A-Za-z0-9._~-]{16,256})(?:\/(continue|approve|deny-login|deny-consent))?$/;
const BODY_MAX=8192;
const SECURITY_HEADERS=Object.freeze({
  'cache-control':'no-store, max-age=0',
  'pragma':'no-cache',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'cross-origin-resource-policy':'same-origin'
});
const enc=x=>String(x).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);

function respond(res,status,body='',type='text/plain; charset=utf-8',headers={}){
  if(res.headersSent||res.writableEnded)return;
  res.writeHead(status,{...SECURITY_HEADERS,'content-type':type,...headers});
  res.end(body);
}
function denied(res,status=403){
  respond(res,status,JSON.stringify({error:'orca_oauth_interaction_unavailable'}),'application/json; charset=utf-8');
}
function trustedOrigin(req,issuerOrigin,isTrustedHttps){
  if(!isObj(req?.headers)||isTrustedHttps(req)!==true)return false;
  return req.headers.host===new URL(issuerOrigin).host;
}
function trustedPost(req,issuerOrigin,isTrustedHttps,type){
  return trustedOrigin(req,issuerOrigin,isTrustedHttps)&&
    req.method==='POST'&&req.headers.origin===issuerOrigin&&
    !req.headers.authorization&&
    (!req.headers['sec-fetch-site']||
      req.headers['sec-fetch-site']==='same-origin')&&
    (type==='json'
      ? /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')
      : /^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''));
}
async function boundedBody(req){
  let total=0;
  const chunks=[];
  if(req.headers['content-length']&&(!/^\d+$/.test(req.headers['content-length'])||
     Number(req.headers['content-length'])>BODY_MAX))
    throw Error('invalid_request_body');
  for await(const part of req){
    total+=part.byteLength;
    if(total>BODY_MAX)throw Error('invalid_request_body');
    chunks.push(Buffer.from(part));
  }
  return Buffer.concat(chunks).toString('utf8');
}
function parseForm(raw){
  const pairs=new URLSearchParams(raw);
  const allowed=new Set(['interactionUid','challengeId','csrfToken','decision']);
  const form={};
  for(const [k,v] of pairs){
    if(!allowed.has(k)||Object.hasOwn(form,k)||v.length>512)
      throw Error('invalid_consent_form');
    form[k]=v;
  }
  if(Object.keys(form).length!==4 ||
     !['approve','continue','deny'].includes(form.decision))
    throw Error('invalid_consent_form');
  return form;
}
function page({prompt,interactionUid,clientId,scope,resource,challengeId,csrfToken}){
  if(!['login','consent'].includes(prompt))throw Error('invalid_oauth_prompt');
  // Form values are issued by the verified session + private CSRF store.
  // No script or third-party resource is needed to approve.
  const action='/interaction/'+encodeURIComponent(interactionUid);
  const fields='<input type="hidden" name="interactionUid" value="'+enc(interactionUid)+'">'+
    '<input type="hidden" name="challengeId" value="'+enc(challengeId)+'">'+
    '<input type="hidden" name="csrfToken" value="'+enc(csrfToken)+'">';
  const login=prompt==='login';
  const primary=login?'Continue with my existing ORCA account':'Approve read-only research';
  const operation=login?'continue':'approve';
  const secondary=login?'deny-login':'deny-consent';
  const main='<form method="post" action="'+action+'/'+operation+'">'+fields+
    '<input type="hidden" name="decision" value="'+operation+'">'+
    '<button type="submit">'+enc(primary)+'</button></form>';
  const deny='<form method="post" action="'+action+'/'+secondary+'">'+fields+
    '<input type="hidden" name="decision" value="deny">'+
    '<button type="submit">Deny access</button></form>';
  const description=login
    ? 'Continue only if this is your existing, signed-in ORCA researcher account.'
    : 'This application requests permission to read only your current ORCA research assignment. No publishing, editing, or account administration.';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>ORCA — AI connection approval</title></head><body>'+
    '<main><h1>'+enc(login?'Continue to ORCA':'Authorize ORCA research access')+'</h1>'+
    '<p>'+enc(description)+'</p><dl>'+
    '<dt>AI application</dt><dd>'+enc(clientId)+'</dd>'+
    '<dt>Permission</dt><dd>'+enc(scope)+'</dd>'+
    '<dt>Authorized resource</dt><dd>'+enc(resource)+'</dd>'+
    '</dl>'+main+deny+'<p>You can refuse. Do not share passwords or codes with an AI agent.</p></main>'+
    '</body></html>';
}

/**
 * Assembles an adapter, not a server. The operator gate is OFF by default.
 * All dependencies must be supplied by a trusted issuer process.
 * A reverse proxy's x-forwarded-proto header is NOT proof of TLS.
 */
export function createOrcaIssuerInteractionHttp({
  enabled=false,issuerOrigin,isTrustedHttps,
  sessionBridge,controller,consentFinalizer
}={}){
  if(typeof issuerOrigin!=='string'||!/^https:\/\/[^/?#]+$/.test(issuerOrigin)||
     typeof isTrustedHttps!=='function'||
     typeof sessionBridge?.issueSessionCookie!=='function'||
     typeof sessionBridge?.readTrustedBrowserSession!=='function'||
     typeof controller?.prepare!=='function'||
     typeof controller?.continueVerifiedLogin!=='function'||
     typeof controller?.denyWithVerifiedSession!=='function'||
     typeof consentFinalizer?.finalize!=='function')
    throw Error('complete_verified_issuer_dependencies_required');
  return async function handler(req,res){
    if(!enabled){denied(res,503);return;}
    const url=typeof req?.url==='string'?req.url:'';
    // Disallow query credentials, ambiguous encodings and fragments.
    if(!url.startsWith('/')||url.includes('?')||url.includes('#')||
       url.includes('%')||url.includes('//')){
      denied(res,404);return;
    }
    if(url==='/session/bootstrap'){
      if(!trustedPost(req,issuerOrigin,isTrustedHttps,'json')){
        denied(res);return;
      }
      try{
        const raw=await boundedBody(req);
        const input=JSON.parse(raw);
        if(!isObj(input)||Object.keys(input).length!==1||
           typeof input.supabaseAccessToken!=='string')
          throw Error('invalid_bootstrap');
        const session=await sessionBridge.issueSessionCookie(req,input);
        respond(res,204,'','text/plain; charset=utf-8',{
          'set-cookie':session.setCookie
        });
      }catch{denied(res);}
      return;
    }
    const match=INTERACTION.exec(url);
    if(!match){denied(res,404);return;}
    const [_,interactionUid,operation]=match;
    if(!trustedOrigin(req,issuerOrigin,isTrustedHttps)){
      denied(res);return;
    }
    if(!operation){
      if(req.method!=='GET'||req.headers.authorization){
        denied(res);return;
      }
      try{
        const info=await controller.prepare(req,res,{interactionUid});
        respond(res,200,page(info),'text/html; charset=utf-8');
      }catch{denied(res);}
      return;
    }
    if(!trustedPost(req,issuerOrigin,isTrustedHttps,'form')){
      denied(res);return;
    }
    try{
      const form=parseForm(await boundedBody(req));
      if(form.interactionUid!==interactionUid)
        throw Error('mismatched_interaction_uid');
      if(operation==='continue'&&form.decision==='continue')
        await controller.continueVerifiedLogin(req,res,form);
      else if(operation==='approve'&&form.decision==='approve')
        await consentFinalizer.finalize(req,res,form);
      else if((operation==='deny-login'||operation==='deny-consent')&&form.decision==='deny')
        await controller.denyWithVerifiedSession(req,res,{
          ...form,expectedPrompt:operation==='deny-login'?'login':'consent'
        });
      else throw Error('wrong_interaction_action');
      // In a real issuer, oidc-provider normally already wrote its redirect.
      // Offline controller tests may not; never invent a redirect destination.
      if(!res.headersSent&&!res.writableEnded)respond(res,204);
    }catch{denied(res);}
  };
}
