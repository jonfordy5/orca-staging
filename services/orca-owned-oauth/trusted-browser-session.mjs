// ORCA-owned OAuth Stage 6: short-lived, sealed, host-only browser session.
// CODE ONLY. The issuer is OFF; this file does NOT expose an HTTP route.
// The hosting layer must supply actual TLS verification (not untrusted
// X-Forwarded-Proto), a same-origin login UI, JSON body limits, CSP and CSRF.
// Never send a Supabase login bearer to the OAuth client or MCP resource.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {verifyExistingResearcher} from './existing-researcher.mjs';

const COOKIE='__Host-orca_oauth_session';
const COOKIE_PREFIX=COOKIE+'=';
const KID=/^[A-Za-z0-9_-]{8,48}$/;
const SESSION=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64=/^[A-Za-z0-9_-]+$/;
const reject=reason=>{throw Error(reason);};
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);

function exactOrigin(value){
  if(typeof value!=='string')reject('issuer_origin_required');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||
     url.search||url.hash||url.origin!==value)
    reject('issuer_https_origin_required');
  return url;
}
function exactCookie(raw){
  if(typeof raw!=='string'||raw.length>8192)reject('missing_or_invalid_browser_cookie');
  const hits=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE_PREFIX));
  if(hits.length!==1)reject('missing_or_invalid_browser_cookie');
  const token=hits[0].slice(COOKIE_PREFIX.length);
  if(token.length>3000||!token)reject('missing_or_invalid_browser_cookie');
  return token;
}
function keyringOrFail(keys){
  if(!Array.isArray(keys)||!keys.length||keys.length>3)
    reject('issuer_session_keyring_required');
  const seen=new Set();
  return keys.map(({id,key})=>{
    if(typeof id!=='string'||!KID.test(id)||seen.has(id)||
       !(key instanceof Uint8Array)||key.byteLength!==32)
      reject('invalid_issuer_session_key');
    seen.add(id);
    return {id,key:Buffer.from(key)};
  });
}
function verifiedRequest(req,issuer,isTrustedHttps){
  if(!isObj(req)||!isObj(req.headers)||isTrustedHttps(req)!==true)
    reject('verified_tls_required');
  if(req.headers.host!==issuer.host)
    reject('issuer_host_mismatch');
}
function verifiedSameOriginPost(req,issuer,isTrustedHttps){
  verifiedRequest(req,issuer,isTrustedHttps);
  if(req.method!=='POST'||req.headers.origin!==issuer.origin||
     !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||
     (req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')||
     req.headers.authorization)
    reject('trusted_same_origin_post_required');
}
function b64(x){return Buffer.from(x).toString('base64url');}
function bytes(x,n){
  if(typeof x!=='string'||!B64.test(x))reject('invalid_sealed_cookie');
  const decoded=Buffer.from(x,'base64url');
  if(decoded.length!==n||b64(decoded)!==x)reject('invalid_sealed_cookie');
  return decoded;
}
function seal(payload,{id,key},aad){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted=Buffer.concat([
    cipher.update(JSON.stringify(payload),'utf8'),cipher.final()
  ]);
  const tag=cipher.getAuthTag();
  return ['v1',id,b64(iv),b64(encrypted),b64(tag)].join('.');
}
function unseal(raw,keys,aad){
  const pieces=raw.split('.');
  if(pieces.length!==5||pieces[0]!=='v1'||!KID.test(pieces[1]))
    reject('invalid_sealed_cookie');
  const key=keys.find(k=>k.id===pieces[1]);
  if(!key)reject('unknown_session_key');
  const iv=bytes(pieces[2],12);
  if(typeof pieces[3]!=='string'||!B64.test(pieces[3])||pieces[3].length>2500)
    reject('invalid_sealed_cookie');
  const ciphertext=Buffer.from(pieces[3],'base64url');
  if(b64(ciphertext)!==pieces[3])reject('invalid_sealed_cookie');
  const tag=bytes(pieces[4],16);
  try{
    const decipher=createDecipheriv('aes-256-gcm',key.key,iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()])
      .toString('utf8'));
  }catch{reject('invalid_sealed_cookie');}
}

/**
 * Requires an actual HTTPS origin and a host-managed TLS trust callback.
 * For reverse proxies, the callback must verify a private proxy-to-issuer
 * boundary; never rely on arbitrary client-supplied forwarded headers.
 * No OAuth token is minted or OAuth grant created by this bridge.
 */
export function createTrustedBrowserSession({
  issuerOrigin,keyring,auth,ownerScopedProfileRead,
  isTrustedHttps=({socket})=>socket?.encrypted===true,
  now=()=>Date.now(),maxAgeSeconds=600
}={}){
  const issuer=exactOrigin(issuerOrigin);
  const keys=keyringOrFail(keyring);
  if(typeof auth?.getUser!=='function'||
     typeof ownerScopedProfileRead!=='function'||
     typeof isTrustedHttps!=='function'||typeof now!=='function'||
     !Number.isInteger(maxAgeSeconds)||maxAgeSeconds<60||maxAgeSeconds>900)
    reject('trusted_browser_session_configuration_required');
  const aad='ORCA_OAUTH_BROWSER_SESSION:v1:'+issuer.origin+':'+COOKIE;
  const attrs='; Path=/; HttpOnly; Secure; SameSite=Lax';
  async function issueSessionCookie(req,{supabaseAccessToken}={}){
    verifiedSameOriginPost(req,issuer,isTrustedHttps);
    const researcher=await verifyExistingResearcher({
      auth,ownerScopedProfileRead,supabaseBearer:supabaseAccessToken
    });
    const issuedAt=now();
    if(!Number.isSafeInteger(issuedAt)||issuedAt<0)
      reject('invalid_session_clock');
    const payload={
      ownerId:researcher.ownerId,
      supabaseAccessToken,
      browserSessionId:randomBytes(32).toString('base64url'),
      issuedAt,expiresAt:issuedAt+maxAgeSeconds*1000
    };
    const token=seal(payload,keys[0],aad);
    if(token.length>3000)reject('sealed_cookie_too_large');
    return Object.freeze({
      setCookie:COOKIE_PREFIX+token+'; Max-Age='+maxAgeSeconds+attrs,
      expiresAt:payload.expiresAt
    });
  }
  async function readTrustedBrowserSession(req){
    verifiedRequest(req,issuer,isTrustedHttps);
    if(req.headers.authorization)reject('agent_bearer_is_not_a_browser_session');
    const token=exactCookie(req.headers.cookie);
    const p=unseal(token,keys,aad);
    const timestamp=now();
    if(!isObj(p)||!UUID.test(p.ownerId||'')||
       typeof p.supabaseAccessToken!=='string'||
       p.supabaseAccessToken.split('.').length!==3||
       typeof p.browserSessionId!=='string'||!SESSION.test(p.browserSessionId)||
       !Number.isSafeInteger(timestamp)||
       !Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||
       p.issuedAt>timestamp+5000||p.expiresAt<=timestamp||
       p.expiresAt-p.issuedAt!==maxAgeSeconds*1000)
      reject('invalid_or_expired_browser_session');
    // The downstream interaction controller MUST freshly call Supabase
    // Auth.getUser + owner-scoped profile read on every consent/login action.
    return Object.freeze({
      supabaseAccessToken:p.supabaseAccessToken,
      browserSessionId:p.browserSessionId
    });
  }
  function clearSessionCookie(req){
    verifiedSameOriginPost(req,issuer,isTrustedHttps);
    return COOKIE_PREFIX+'; Max-Age=0'+attrs;
  }
  return Object.freeze({issueSessionCookie,readTrustedBrowserSession,clearSessionCookie});
}
