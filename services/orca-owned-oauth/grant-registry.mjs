// ORCA-owned OAuth: server-only durable consent/grant registry.
// This is NOT a web route. Caller identity must be verified by Supabase Auth
// BEFORE a server-only consent handler calls createGrant or revokeGrant.
//
// query(sql, values) is an injected, restricted, direct PostgreSQL query
// function; never use a browser Supabase client or service-role HTTP endpoint.
// Backing tables are private, with no anon/authenticated/Data API access.
// The separate draft SQL is NOT applied automatically.
import {randomUUID} from 'node:crypto';

export const OWNED_READ_SCOPE='orca:research.read';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GRANT_MS=30*24*60*60*1000;
const requireUuid=(s,label)=>{
  if(typeof s!=='string'||!UUID.test(s))throw Error('invalid_'+label);
};
function validResource(s){
  if(typeof s!=='string')return false;
  try {
    const u=new URL(s);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&
      !u.search&&u.href===s;
  }catch{return false;}
}

export function createOwnedGrantRegistry({query,resource}={}){
  if(typeof query!=='function'||!validResource(resource))
    throw Error('private_database_and_exact_resource_required');

  // Called ONLY by the issuer's authenticated, CSRF-checked consent handler.
  // The callback must verify a short-lived, single-use server-side approval
  // event tied to owner/client/resource. Never accept user-supplied "approved".
  async function createGrant({ownerId,clientId,scope=OWNED_READ_SCOPE,
    expiresAt,assertApprovedConsent}={}){
    requireUuid(ownerId,'owner');
    requireUuid(clientId,'client');
    if(scope!==OWNED_READ_SCOPE || typeof assertApprovedConsent!=='function')
      throw Error('trusted_consent_verification_required');
    const until=new Date(expiresAt);
    const duration=until.getTime()-Date.now();
    if(!Number.isFinite(duration)||duration<=0||duration>MAX_GRANT_MS)
      throw Error('invalid_grant_expiry');

    const permitted=await assertApprovedConsent({ownerId,clientId,resource,scope});
    if(permitted!==true)throw Error('consent_not_verified');
    const grantId=randomUUID();
    const result=await query(
      'insert into orca_owned_oauth_private.grants '+
      '(id,owner_id,client_id,resource,scope,expires_at) '+
      'values ($1,$2,$3,$4,$5,$6) returning id',
      [grantId,ownerId,clientId,resource,scope,until.toISOString()]
    );
    if(result?.rowCount!==1||result.rows?.[0]?.id!==grantId)
      throw Error('consent_persistence_failed');
    return {grantId,ownerId,clientId,resource,scope,active:true};
  }

  // Called by the MCP verifier for EVERY signed access-token use. Any
  // network/DB failure throws; the outer verifier must then reject the read.
  async function isCurrentGrant({grantId,ownerId,clientId,resource:aud,scope}={}){
    requireUuid(grantId,'grant');
    requireUuid(ownerId,'owner');
    requireUuid(clientId,'client');
    if(aud!==resource||scope!==OWNED_READ_SCOPE)return false;
    const result=await query(
      'select 1 as active from orca_owned_oauth_private.grants '+
      'where id=$1 and owner_id=$2 and client_id=$3 '+
      'and resource=$4 and scope=$5 '+
      'and revoked_at is null and expires_at > now() limit 1',
      [grantId,ownerId,clientId,resource,scope]
    );
    return result?.rowCount===1&&result.rows?.[0]?.active===1;
  }

  // Owner ID must come from Supabase Auth.getUser, never URL/form/agent data.
  // Conditional UPDATE makes revoke idempotent under concurrent clicks.
  async function revokeGrant({verifiedOwnerId,grantId}={}){
    requireUuid(verifiedOwnerId,'owner');
    requireUuid(grantId,'grant');
    const result=await query(
      'update orca_owned_oauth_private.grants '+
      'set revoked_at=clock_timestamp() '+
      'where id=$1 and owner_id=$2 and revoked_at is null returning id',
      [grantId,verifiedOwnerId]
    );
    return result?.rowCount===1&&result.rows?.[0]?.id===grantId;
  }

  async function listOwnerGrants(verifiedOwnerId){
    requireUuid(verifiedOwnerId,'owner');
    const result=await query(
      'select id,client_id,resource,scope,created_at,expires_at,revoked_at '+
      'from orca_owned_oauth_private.grants '+
      'where owner_id=$1 order by created_at desc limit 100',
      [verifiedOwnerId]
    );
    if(!Array.isArray(result?.rows))throw Error('grant_lookup_failed');
    return result.rows;
  }

  return Object.freeze({createGrant,isCurrentGrant,revokeGrant,listOwnerGrants});
}
