// ORCA-owned OAuth: private, one-time CSRF challenge for the future consent UI.
// A challenge alone never establishes identity, consent, or a usable OAuth grant.
// Both create/consume must be called ONLY by issuer backend with a separately
// verified Supabase owner, an oidc-provider interaction and browser session.
// The raw nonce is rendered to the authenticated human exactly once; only
// SHA-256 digests are stored. This code is not deployed.
import {createHash,randomBytes,randomUUID} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE=/^[\x21-\x7e]{16,512}$/;
const CLIENT=/^[\x21-\x7e]{1,512}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const digest=x=>createHash('sha256').update(x,'utf8').digest();

function checked(value,pattern,label){
  if(typeof value!=='string'||!pattern.test(value))
    throw Error('invalid_'+label);
}
function validResource(s){
  if(typeof s!=='string')return false;
  try {
    const url=new URL(s);
    return url.protocol==='https:'&&!url.username&&!url.password&&
      !url.search&&!url.hash&&url.href===s;
  }catch{return false;}
}
export function createPrivateConsentChallenges({query,resource}={}){
  if(typeof query!=='function'||!validResource(resource))
    throw Error('private_consent_store_required');

  function checkedSession({ownerId,clientId,interactionUid,browserSessionId}={}){
    checked(ownerId,UUID,'verified_owner');
    checked(clientId,CLIENT,'registered_client');
    checked(interactionUid,OPAQUE,'interaction');
    checked(browserSessionId,OPAQUE,'browser_session');
  }

  async function prepare({ownerId,clientId,interactionUid,browserSessionId,ttlSeconds=180}={}){
    checkedSession({ownerId,clientId,interactionUid,browserSessionId});
    if(!Number.isInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>300)
      throw Error('invalid_consent_ttl');
    const challengeId=randomUUID();
    const csrfToken=randomBytes(32).toString('base64url');
    const result=await query(
      'insert into orca_owned_oauth_private.consent_challenges '+
      '(id,owner_id,client_id,resource,interaction_hash,session_hash,csrf_hash,expires_at) '+
      'values ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+($8::integer * interval \'1 second\')) returning id',
      [challengeId,ownerId,clientId,resource,
        digest(interactionUid),digest(browserSessionId),digest(csrfToken),ttlSeconds]
    );
    if(result?.rowCount!==1||result.rows?.[0]?.id!==challengeId)
      throw Error('csrf_challenge_not_persisted');
    return {challengeId,csrfToken};
  }

  // The caller must independently verify the user pressed Approve, that the
  // oidc-provider interaction is still valid, and that the session UID and
  // audience came from the SERVER. This only enforces a one-use challenge.
  async function consume({challengeId,csrfToken,ownerId,clientId,
    interactionUid,browserSessionId}={}){
    checked(challengeId,UUID,'challenge');
    checked(csrfToken,NONCE,'csrf');
    checkedSession({ownerId,clientId,interactionUid,browserSessionId});
    const result=await query(
      'update orca_owned_oauth_private.consent_challenges '+
      'set consumed_at=clock_timestamp() '+
      'where id=$1 and owner_id=$2 and client_id=$3 and resource=$4 '+
      'and interaction_hash=$5 and session_hash=$6 and csrf_hash=$7 '+
      'and consumed_at is null and expires_at>clock_timestamp() returning id',
      [challengeId,ownerId,clientId,resource,
        digest(interactionUid),digest(browserSessionId),digest(csrfToken)]
    );
    if(!result||typeof result.rowCount!=='number')
      throw Error('csrf_store_unavailable');
    return result.rowCount===1 && result.rows?.[0]?.id===challengeId;
  }
  return Object.freeze({prepare,consume});
}
