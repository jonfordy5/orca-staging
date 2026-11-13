// ORCA Plan B: bridge oidc-provider's INTERNAL grant ID to the durable,
// owner-bound ORCA consent grant ID before an access token can be minted.
// Without this bridge a JWT may be signed but would not be revocable through
// ORCA's grant registry. Fail CLOSED: no magic default, no automatic grant.
//
// This is a library callback, not a user-visible HTTP endpoint. It requires
// a private server-only lookup over existing verified grant records.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT=/^[\x21-\x7e]{1,512}$/;
const READ_SCOPE='orca:research.read';
const OPAQUE=/^[A-Za-z0-9._~-]{8,1024}$/;

export async function claimForProviderAccessToken(token,{
  resource,approvedClientId,lookupOwnedGrant
}={}){
  if(typeof lookupOwnedGrant!=='function')throw Error('owned_grant_binding_required');
  if(!token||typeof token!=='object'||token.kind!=='AccessToken'||
    typeof token.accountId!=='string'||!UUID.test(token.accountId)||
    typeof token.clientId!=='string'||!CLIENT.test(token.clientId)||
    token.clientId!==approvedClientId||
    typeof token.grantId!=='string'||!OPAQUE.test(token.grantId)||
    typeof resource!=='string'||!resource.startsWith('https://')||
    // oidc-provider v9 stores RFC 8707 resolved resource on AccessToken.aud.
    // A custom token.resource field does not exist and must not be trusted.
    token.aud!==resource)
    throw Error('unbound_resource_owner_or_client');
  const scopes=typeof token.scope==='string'
    ?token.scope.split(/\s+/).filter(Boolean):[];
  if(!scopes.includes(READ_SCOPE)||
     scopes.some(s=>!['openid','profile',READ_SCOPE].includes(s)))
    throw Error('unapproved_access_scope');

  // The mapping MUST be private and exact for providerGrantId, owner,
  // approved client, resource, and scope. No wildcard or "most recent".
  const stored=await lookupOwnedGrant({
    providerGrantId:token.grantId,
    ownerId:token.accountId,clientId:token.clientId,
    resource,scope:READ_SCOPE
  });
  if(!stored||stored.active!==true||!UUID.test(stored.grantId||'')||
     stored.ownerId!==token.accountId||
     stored.clientId!==token.clientId||
     stored.resource!==resource||
     stored.scope!==READ_SCOPE)
    throw Error('owned_grant_missing_or_revoked');

  return Object.freeze({
    client_id:token.clientId,grant_id:stored.grantId,
    scope:READ_SCOPE
  });
}
