// ORCA Commons staging: public OAuth/MCP discovery verifier.
// This is NOT an authorization token or an end-to-end OAuth compatibility test.
// Never claim ChatGPT is linked based only on these public metadata responses.
export const ORCA_STAGING_PROJECT='https://vbziibatnejoswsdggga.supabase.co';
export const ORCA_STAGING_ISSUER=ORCA_STAGING_PROJECT+'/auth/v1';
export const ORCA_STAGING_RESOURCE=ORCA_STAGING_PROJECT+'/functions/v1/orca-agent-mcp';
// @supabase/server withOAuthProtectedResource serves discovery at the
// function URL + /oauth-protected-resource (not under /.well-known here).
export const ORCA_STAGING_RESOURCE_METADATA=ORCA_STAGING_RESOURCE+'/oauth-protected-resource';
export const ORCA_STAGING_AUTH_METADATA=ORCA_STAGING_PROJECT+'/.well-known/oauth-authorization-server/auth/v1';

// Independent operator release gate. This MUST stay false until a real, correctly
// resource-bound access token and two-account revoke/permission tests pass.
// Do not conflate passing metadata checks with an enabled ChatGPT connection.
export const ORCA_AGENT_OAUTH_PILOT_ENABLED=false;

const plainRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const includes=(value,item)=>Array.isArray(value)&&value.includes(item);
const exactHostedEndpoint=(value,base)=>{
  if(typeof value!=='string')return false;
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&url.origin===base&&
      !url.username&&!url.password&&!url.hash&&!url.search;
  } catch{return false;}
};
export function assessOAuthDiscovery(resourceMetadata,authorizationMetadata){
  const reasons=[];
  if(!plainRecord(resourceMetadata)||resourceMetadata.resource!==ORCA_STAGING_RESOURCE){
    reasons.push('wrong_or_missing_resource');
  }
  if(!includes(resourceMetadata?.authorization_servers,ORCA_STAGING_ISSUER)){
    reasons.push('wrong_or_missing_issuer');
  }
  if(!plainRecord(authorizationMetadata)||authorizationMetadata.issuer!==ORCA_STAGING_ISSUER){
    reasons.push('issuer_mismatch');
  }
  if(!includes(authorizationMetadata?.response_types_supported,'code')){
    reasons.push('authorization_code_unavailable');
  }
  if(!includes(authorizationMetadata?.code_challenge_methods_supported,'S256')){
    reasons.push('pkce_s256_unavailable');
  }
  if(!exactHostedEndpoint(authorizationMetadata?.authorization_endpoint,ORCA_STAGING_PROJECT)){
    reasons.push('authorization_endpoint_untrusted');
  }
  if(!exactHostedEndpoint(authorizationMetadata?.token_endpoint,ORCA_STAGING_PROJECT)){
    reasons.push('token_endpoint_untrusted');
  }
  // Supabase supports manual pre-registration; Dynamic Client Registration
  // (DCR) is optional. Reject a dangerous advertised URL, but do not require
  // DCR before checking an independently approved, pre-registered client.
  const registration=authorizationMetadata?.registration_endpoint;
  if(registration!=null&&!exactHostedEndpoint(registration,ORCA_STAGING_PROJECT)){
    reasons.push('registration_endpoint_untrusted');
  }
  return {metadataReady:reasons.length===0,connectionReady:reasons.length===0&&ORCA_AGENT_OAUTH_PILOT_ENABLED,reasons};
}
