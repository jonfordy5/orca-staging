// ORCA Plan B: consent -> linked ORCA/private OAuth grant, OFFLINE ONLY.
// No HTTP listener exports this function. A future POST handler must enforce
// Origin/Host, TLS, HttpOnly Secure SameSite cookie, Content-Type and CSRF.
// The existingResearcher controller verifies Supabase Auth.getUser, owner
// profile, client/callback, PKCE S256, resource, session UID + one-time CSRF
// again at the moment of approval. Never trust a submitted account/alias.
//
// Designed to fail closed if any operation is missing. A partial commit
// cannot generate an access token: extraTokenClaims requires the exact
// *linked and active* ORCA grant on the subsequent authorization-code exchange.
import {ORCA_READ_SCOPE} from './issuer-policy.mjs';

const DEFAULT_TTL_MS=60*60*1000;
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const deny=(x)=>{throw Error(x);};
function ownedScopes(details,resource){
  if(!obj(details))deny('missing_consent_details');
  const resourceScopes=details.missingResourceScopes;
  if(!obj(resourceScopes)||Object.keys(resourceScopes).length!==1 ||
    !Array.isArray(resourceScopes[resource])||
    resourceScopes[resource].length!==1||
    resourceScopes[resource][0]!==ORCA_READ_SCOPE)
    deny('unapproved_resource_consent');
  const oidc=details.missingOIDCScope;
  if(oidc!=null&&(!Array.isArray(oidc)||
    // oidc-provider exposes custom resource scope in missingOIDCScope
    // as well as missingResourceScopes. Allow ONLY this exact read scope.
    oidc.some(x=>!['openid','profile',ORCA_READ_SCOPE].includes(x))))
    deny('unapproved_oidc_consent');
  if(details.rar||details.missingOIDCClaims?.length)
    deny('unsupported_consent_extension');
  return {oidc:oidc||[],scope:ORCA_READ_SCOPE};
}

export function createSafeConsentFinalizer({
  controller,provider,grantRegistry,resource,now=()=>Date.now(),
  grantTtlMs=DEFAULT_TTL_MS
}={}){
  if(typeof controller?.consumeVerifiedConsent!=='function'||
     typeof provider?.interactionFinished!=='function'||
     typeof provider?.Grant!=='function'||
     typeof grantRegistry?.createGrant!=='function'||
     typeof grantRegistry?.linkProviderGrant!=='function'||
     typeof grantRegistry?.revokeGrant!=='function'||
     typeof resource!=='string'||!resource.startsWith('https://')||
     !Number.isInteger(grantTtlMs)||grantTtlMs<1000||grantTtlMs>3600_000)
    throw Error('private_verified_consent_integration_required');

  async function finalize(req,res,form){
    // A server endpoint must check explicit click on Approve; reject
    // ambiguous/missing choices. Binding comes from provider and Supabase,
    // never from arbitrary form owner, scope, callback, or client.
    if(!obj(form)||form.decision!=='approve')
      deny('explicit_approval_required');
    const verified=await controller.consumeVerifiedConsent(req,res,form);
    const {interaction,researcher}=verified;
    if(!obj(interaction)||interaction.prompt?.name!=='consent'||
       interaction.grantId!=null)
      deny('fresh_explicit_consent_only');
    if(!obj(interaction.params)||
       interaction.params.resource!==resource)
      deny('wrong_consent_resource');

    const {oidc}=ownedScopes(interaction.prompt.details,resource);
    const ownerId=researcher.ownerId;
    const clientId=interaction.params.client_id;
    const grant=new provider.Grant({accountId:ownerId,clientId});
    if(oidc.length)grant.addOIDCScope(oidc.join(' '));
    grant.addResourceScope(resource,ORCA_READ_SCOPE);

    let owned=null,providerGrantId=null;
    try{
      // Consent callback is not injectable by an agent or form; it is
      // generated only after fresh owner verification + used CSRF challenge.
      owned=await grantRegistry.createGrant({
        ownerId,clientId,scope:ORCA_READ_SCOPE,
        expiresAt:new Date(now()+grantTtlMs).toISOString(),
        assertApprovedConsent:async expected=>
          expected.ownerId===ownerId&&expected.clientId===clientId&&
          expected.resource===resource&&expected.scope===ORCA_READ_SCOPE
      });
      providerGrantId=await grant.save();
      if(typeof providerGrantId!=='string'||providerGrantId.length<8)
        deny('provider_grant_save_failed');
      const linked=await grantRegistry.linkProviderGrant({
        verifiedOwnerId:ownerId,clientId,grantId:owned.grantId,
        providerGrantId
      });
      if(linked!==true)deny('provider_grant_link_failed');
      await provider.interactionFinished(req,res,{
        consent:{grantId:providerGrantId}
      },{mergeWithLastSubmission:true});
      return {approved:true,ownerId,grantId:owned.grantId};
    }catch(error){
      // Revoke owned grant first so any later token mint fails its
      // per-request registry check. Then best-effort delete provider grant.
      if(owned?.grantId){
        try{await grantRegistry.revokeGrant({
          verifiedOwnerId:ownerId,grantId:owned.grantId
        });}catch{/* source error preserved; fail closed */}
      }
      if(providerGrantId){
        try{await grant.destroy();}catch{/* no interaction continuation */}
      }
      throw error;
    }
  }
  return Object.freeze({finalize});
}
