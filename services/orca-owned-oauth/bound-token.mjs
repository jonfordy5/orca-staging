// ORCA-owned resource-bound ES256 access-token primitives.
// These are NOT OAuth server endpoints. The real authorization server must
// own signing keys, authenticate Supabase users, persist explicit consent,
// consume authorization codes atomically, rotate refresh tokens and enforce
// the separate pilot release switch before calling the signer.
import {createSign,createVerify,randomUUID} from 'node:crypto';

export const READ_SCOPE='orca:research.read';
export const MAX_ACCESS_SECONDS=300;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientIdentifier=/^[\x21-\x7e]{1,512}$/;
// oidc-provider v9 uses a high-entropy 43-character base64url jti;
// hand-signed ORCA test tokens use UUID jti. Both are opaque, not owner IDs.
const tokenIdentifier=/^[A-Za-z0-9_-]{16,128}$/;
const b64=/^[A-Za-z0-9_-]+$/;

function record(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function base64(v){return Buffer.from(JSON.stringify(v)).toString('base64url');}
function asJson(v){
  if(typeof v!=='string'||v.length<2||v.length>8192||!b64.test(v))throw Error('invalid_token');
  const json=JSON.parse(Buffer.from(v,'base64url').toString('utf8'));
  if(!record(json))throw Error('invalid_token');
  return json;
}
export function signBoundAccessToken({issuer,resource,grant,kid,privateKey,now=Math.floor(Date.now()/1000),ttl=300}={}){
  if(typeof issuer!=='string'||!issuer.startsWith('https://')||
      typeof resource!=='string'||!resource.startsWith('https://')||
      typeof kid!=='string'||kid.length<8||kid.length>128||
      !record(grant)||grant.active!==true||
      !uuid.test(grant.ownerId||'')||!clientIdentifier.test(grant.clientId||'')||
      !uuid.test(grant.grantId||'')||grant.resource!==resource||
      grant.scope!==READ_SCOPE||
      !Number.isInteger(now)||ttl>MAX_ACCESS_SECONDS||ttl<1||
      !privateKey)throw Error('trusted_grant_and_signing_configuration_required');
  const header={alg:'ES256',typ:'at+jwt',kid};
  const claims={
    iss:issuer,sub:grant.ownerId,aud:resource,client_id:grant.clientId,
    grant_id:grant.grantId,scope:READ_SCOPE,iat:now,exp:now+ttl,jti:randomUUID()
  };
  const signingInput=base64(header)+'.'+base64(claims);
  const signer=createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature=signer.sign({key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return signingInput+'.'+signature;
}

export async function verifyBoundAccessToken(token,{
  issuer,resource,kid,publicKey,approvedClientIds,currentGrant,
  now=Math.floor(Date.now()/1000)
}={}){
  const deny=reason=>({ok:false,reason});
  if(typeof token!=='string'||token.length>8192||!publicKey||
     !Number.isInteger(now))return deny('invalid_token');
  const parts=token.split('.');
  if(parts.length!==3||parts.some(x=>!b64.test(x)))return deny('invalid_token');
  try {
    const header=asJson(parts[0]),claims=asJson(parts[1]);
    if(header.alg!=='ES256'||header.typ!=='at+jwt'||
       header.kid!==kid||!Object.hasOwn(header,'kid'))return deny('invalid_header');
    const verifier=createVerify('SHA256');
    verifier.update(parts[0]+'.'+parts[1]);verifier.end();
    if(!verifier.verify({key:publicKey,dsaEncoding:'ieee-p1363'},
      Buffer.from(parts[2],'base64url')))return deny('invalid_signature');
    if(claims.iss!==issuer||claims.aud!==resource||claims.iss===resource)
      return deny('wrong_issuer_or_resource');
    if(!uuid.test(claims.sub||'')||!clientIdentifier.test(claims.client_id||'')||
       !uuid.test(claims.grant_id||'')||!tokenIdentifier.test(claims.jti||'')||
       claims.scope!==READ_SCOPE||
       !Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||
       claims.iat>now+30||claims.exp<=now||
       claims.exp-claims.iat<1||claims.exp-claims.iat>MAX_ACCESS_SECONDS)
      return deny('invalid_claims');
    if(!(approvedClientIds instanceof Set)||
       !approvedClientIds.has(claims.client_id))return deny('client_not_approved');
    if(typeof currentGrant!=='function')return deny('active_grant_check_unavailable');
    // Must query a durable ORCA grant registry on EVERY read. A once-valid
    // JWT is NOT proof of current consent; revocation is immediate.
    if(await currentGrant({
      grantId:claims.grant_id,ownerId:claims.sub,clientId:claims.client_id,
      resource:claims.aud,scope:claims.scope
    })!==true)return deny('grant_revoked_or_mismatched');
    return {ok:true,ownerId:claims.sub,clientId:claims.client_id,
      grantId:claims.grant_id};
  }catch{
    return deny('invalid_token');
  }
}
