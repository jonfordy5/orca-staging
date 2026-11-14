// ORCA Stage 11 — opaque, server-side browser sessions for OAuth consent.
// CODE ONLY / RELEASE OFF: no listener, database migration, or live credential.
// Unlike Stage 6's sealed-cookie prototype, no Supabase bearer is stored in
// the browser. Cookies contain ONLY an unpredictable 32-byte session handle.
// Server-side records must be encrypted and stored in a private, expiring DB.
// The existing interaction controller revalidates Supabase Auth.getUser and
// current opted-in owner on EVERY login and consent action.
import {
  createHash,createCipheriv,createDecipheriv,randomBytes
} from 'node:crypto';
import {verifyExistingResearcher} from './existing-researcher.mjs';

const COOKIE='__Host-orca_oauth_session';
const COOKIE_PREFIX=COOKIE+'=';
const SESSION=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KID=/^[A-Za-z0-9_-]{8,48}$/;
const deny=message=>{throw Error(message);};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x,'utf8').digest();
const b64=x=>Buffer.from(x).toString('base64url');
function keyringOrThrow(keys){
  if(!Array.isArray(keys)||keys.length<1||keys.length>3)
    deny('private_session_keyring_required');
  const seen=new Set();
  return keys.map(x=>{
    if(!obj(x)||typeof x.id!=='string'||!KID.test(x.id)||
       seen.has(x.id)||!(x.key instanceof Uint8Array)||x.key.byteLength!==32)
      deny('invalid_private_session_key');
    seen.add(x.id);
    return {id:x.id,key:Buffer.from(x.key)};
  });
}
function originOrThrow(raw){
  if(typeof raw!=='string')deny('invalid_private_session_origin');
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.origin!==raw||
     url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    deny('invalid_private_session_origin');
  return url;
}
function trusted(req,issuer,isTrustedHttps,post=false){
  if(!obj(req?.headers)||isTrustedHttps(req)!==true||
     req.headers.host!==issuer.host||req.headers.authorization)
    deny('trusted_browser_request_required');
  if(post&&(req.method!=='POST'||req.headers.origin!==issuer.origin||
     (req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')||
     !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
       req.headers['content-type']||'')))
    deny('trusted_same_origin_session_post_required');
}
function cookieFrom(req){
  const raw=req?.headers?.cookie;
  if(typeof raw!=='string'||raw.length>4096)
    deny('missing_browser_session');
  const hits=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE_PREFIX));
  if(hits.length!==1)deny('missing_browser_session');
  const token=hits[0].slice(COOKIE_PREFIX.length);
  if(!SESSION.test(token))deny('invalid_browser_session_handle');
  return token;
}
function aad(ownerId,digest,issuedAt,expiresAt){
  return Buffer.from(
    'ORCA_OAUTH_PRIVATE_SESSION_V1|'+ownerId+'|'+
    digest.toString('hex')+'|'+issuedAt+'|'+expiresAt,'utf8'
  );
}
function encrypt(data,key,associated){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key.key,iv);
  cipher.setAAD(associated);
  const ciphertext=Buffer.concat([
    cipher.update(JSON.stringify(data),'utf8'),cipher.final()
  ]);
  return {keyId:key.id,iv,ciphertext,tag:cipher.getAuthTag()};
}
function decrypt(row,keys,associated){
  const key=keys.find(x=>x.id===row.keyId);
  if(!key||!Buffer.isBuffer(row.iv)||row.iv.length!==12||
     !Buffer.isBuffer(row.ciphertext)||!Buffer.isBuffer(row.tag)||
     row.tag.length!==16)deny('invalid_private_session_record');
  try{
    const decipher=createDecipheriv('aes-256-gcm',key.key,row.iv);
    decipher.setAAD(associated);decipher.setAuthTag(row.tag);
    return JSON.parse(Buffer.concat([
      decipher.update(row.ciphertext),decipher.final()
    ]).toString('utf8'));
  }catch{deny('invalid_private_session_record');}
}

/**
 * Store must durably implement create({sessionHash,ownerId,keyId,iv,
 * ciphertext,tag,issuedAt,expiresAt}), find(sessionHash), and
 * revoke(sessionHash) with one private PostgreSQL role. It MUST NOT be
 * reachable via PostgREST, browser JS, or a service_role proxy.
 */
export function createOpaqueBrowserSessionBridge({
  issuerOrigin,keyring,store,auth,ownerScopedProfileRead,
  isTrustedHttps=({socket})=>socket?.encrypted===true,
  now=()=>Date.now(),maxAgeSeconds=600
}={}){
  const issuer=originOrThrow(issuerOrigin);
  const keys=keyringOrThrow(keyring);
  if(typeof store?.create!=='function'||typeof store?.find!=='function'||
     typeof store?.revoke!=='function'||typeof auth?.getUser!=='function'||
     typeof ownerScopedProfileRead!=='function'||
     typeof isTrustedHttps!=='function'||typeof now!=='function'||
     !Number.isInteger(maxAgeSeconds)||maxAgeSeconds<60||maxAgeSeconds>900)
    deny('private_session_dependencies_required');
  const attrs='; Path=/; HttpOnly; Secure; SameSite=Lax';
  async function issueSessionCookie(req,{supabaseAccessToken}={}){
    trusted(req,issuer,isTrustedHttps,true);
    const researcher=await verifyExistingResearcher({
      auth,ownerScopedProfileRead,supabaseBearer:supabaseAccessToken
    });
    const timestamp=now();
    if(!Number.isSafeInteger(timestamp)||timestamp<0)
      deny('invalid_session_clock');
    const expiresAt=timestamp+1000*maxAgeSeconds;
    const handle=randomBytes(32).toString('base64url');
    const sessionHash=sha(handle);
    const browserSessionId=randomBytes(32).toString('base64url');
    const data={ownerId:researcher.ownerId,supabaseAccessToken,
      browserSessionId,issuedAt:timestamp,expiresAt};
    const encrypted=encrypt(data,keys[0],
      aad(researcher.ownerId,sessionHash,timestamp,expiresAt));
    const saved=await store.create({
      sessionHash,ownerId:researcher.ownerId,
      issuedAt:timestamp,expiresAt,...encrypted
    });
    if(saved!==true)deny('private_session_not_persisted');
    return Object.freeze({
      setCookie:COOKIE_PREFIX+handle+'; Max-Age='+maxAgeSeconds+attrs,
      expiresAt
    });
  }
  async function readTrustedBrowserSession(req){
    trusted(req,issuer,isTrustedHttps);
    const sessionHash=sha(cookieFrom(req));
    const row=await store.find(sessionHash);
    const timestamp=now();
    if(!obj(row)||!UUID.test(row.ownerId||'')||
       !Number.isSafeInteger(row.issuedAt)||
       !Number.isSafeInteger(row.expiresAt)||
       row.issuedAt>timestamp+5000||row.expiresAt<=timestamp||
       row.expiresAt-row.issuedAt!==1000*maxAgeSeconds||
       !Buffer.isBuffer(row.sessionHash)||
       !row.sessionHash.equals(sessionHash))
      deny('invalid_or_expired_browser_session');
    const value=decrypt(row,keys,
      aad(row.ownerId,sessionHash,row.issuedAt,row.expiresAt));
    if(!obj(value)||value.ownerId!==row.ownerId||
       value.expiresAt!==row.expiresAt||
       value.issuedAt!==row.issuedAt||
       typeof value.supabaseAccessToken!=='string'||
       value.supabaseAccessToken.split('.').length!==3||
       !SESSION.test(value.browserSessionId||''))
      deny('invalid_private_session_record');
    return Object.freeze({
      supabaseAccessToken:value.supabaseAccessToken,
      browserSessionId:value.browserSessionId
    });
  }
  async function clearSessionCookie(req){
    trusted(req,issuer,isTrustedHttps,true);
    const sessionHash=sha(cookieFrom(req));
    // Revoke the actual server-side record before telling a browser to clear.
    if(await store.revoke(sessionHash)!==true)
      deny('private_session_revoke_unconfirmed');
    return COOKIE_PREFIX+'; Max-Age=0'+attrs;
  }
  return Object.freeze({
    issueSessionCookie,readTrustedBrowserSession,clearSessionCookie
  });
}

// Private PostgreSQL adapter contract. Each statement is fixed and parameterized.
// All operations are scoped by the exact SHA-256 session digest; no user-supplied
// owner ID, arbitrary SQL, or session handle is accepted.
export function createPrivatePostgresSessionStore({query}={}){
  if(typeof query!=='function')deny('private_session_database_required');
  const table='orca_owned_oauth_private.browser_sessions';
  const createSql='insert into '+table+
    ' (session_hash,owner_id,key_id,iv,ciphertext,tag,issued_at,expires_at)'+
    ' values ($1,$2,$3,$4,$5,$6,to_timestamp($7::double precision/1000.0),'+
    'to_timestamp($8::double precision/1000.0)) returning session_hash';
  const findSql='select session_hash,owner_id,key_id,iv,ciphertext,tag,'+
    'extract(epoch from issued_at)*1000 as issued_at_ms,'+
    'extract(epoch from expires_at)*1000 as expires_at_ms from '+table+
    ' where session_hash=$1 and revoked_at is null and expires_at>clock_timestamp() limit 1';
  const revokeSql='update '+table+
    ' set revoked_at=clock_timestamp()'+
    ' where session_hash=$1 and revoked_at is null returning session_hash';
  const checked=x=>Buffer.isBuffer(x)&&x.length===32;
  return Object.freeze({
    async create(row){
      if(!obj(row)||!checked(row.sessionHash)||!UUID.test(row.ownerId||'')||
         typeof row.keyId!=='string'||!KID.test(row.keyId)||
         !Buffer.isBuffer(row.iv)||row.iv.length!==12||
         !Buffer.isBuffer(row.ciphertext)||row.ciphertext.length<1||
         !Buffer.isBuffer(row.tag)||row.tag.length!==16||
         !Number.isSafeInteger(row.issuedAt)||
         !Number.isSafeInteger(row.expiresAt))deny('invalid_private_session_write');
      const v=await query(createSql,[
        row.sessionHash,row.ownerId,row.keyId,row.iv,row.ciphertext,row.tag,
        row.issuedAt,row.expiresAt
      ]);
      return v?.rowCount===1&&
        Buffer.isBuffer(v.rows?.[0]?.session_hash)&&
        v.rows[0].session_hash.equals(row.sessionHash);
    },
    async find(sessionHash){
      if(!checked(sessionHash))deny('invalid_session_lookup');
      const v=await query(findSql,[sessionHash]);
      if(v?.rowCount===0)return null;
      if(v?.rowCount!==1||v.rows?.length!==1)
        deny('private_session_database_unavailable');
      const r=v.rows[0];
      return {
        sessionHash:r.session_hash,ownerId:r.owner_id,
        keyId:r.key_id,iv:r.iv,ciphertext:r.ciphertext,tag:r.tag,
        issuedAt:Number(r.issued_at_ms),expiresAt:Number(r.expires_at_ms)
      };
    },
    async revoke(sessionHash){
      if(!checked(sessionHash))deny('invalid_session_revoke');
      const v=await query(revokeSql,[sessionHash]);
      return v?.rowCount===1&&
        Buffer.isBuffer(v.rows?.[0]?.session_hash)&&
        v.rows[0].session_hash.equals(sessionHash);
    }
  });
}
