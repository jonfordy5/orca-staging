// Offline, injectable config for a maintained OAuth authorization-server
// implementation such as oidc-provider v9. This does not launch or deploy it.
// Any live adapter, real consent interaction, client metadata, signing key and
// gate must be independently vetted before provider construction.
import {ORCA_READ_SCOPE} from './issuer-policy.mjs';
import {claimForProviderAccessToken} from './issued-token-binding.mjs';

const clientIdentifier=/^[\x21-\x7e]{1,512}$/;
export function buildOidcProviderProposal({
  resource,clientId,redirectUri,kid,findAccount,persistentAdapter,
  interactionUrl,lookupOwnedGrant
}={}){
  if(typeof resource!=='string'||!resource.startsWith('https://')||
     typeof clientId!=='string'||!clientIdentifier.test(clientId)||
     typeof redirectUri!=='string'||!redirectUri.startsWith('https://')||
     typeof kid!=='string'||kid.length<8||
     typeof findAccount!=='function'||typeof persistentAdapter!=='function'||
     typeof interactionUrl!=='string'||!interactionUrl.startsWith('/'))
    throw Error('vetted_issuer_configuration_required');

  const registeredClient={
    client_id:clientId,redirect_uris:[redirectUri],
    response_types:['code'],
    // Initial pilot intentionally has NO refresh grant until replay-safe
    // rotation and revocation are implemented in the durable adapter.
    grant_types:['authorization_code'],
    token_endpoint_auth_method:'none'
  };
  return {
    clients:[registeredClient],
    adapter:persistentAdapter,
    findAccount,
    // oidc-provider executes this on access-token issuance. No token may be
    // issued until a separate, private, exact owned-grant mapping exists.
    extraTokenClaims:async (_ctx,token)=>claimForProviderAccessToken(token,{
      resource,approvedClientId:clientId,lookupOwnedGrant
    }),
    scopes:['openid','profile',ORCA_READ_SCOPE],
    responseTypes:['code'],
    pkce:{required:()=>true},
    features:{
      devInteractions:{enabled:false},
      registration:{enabled:false},
      resourceIndicators:{
        enabled:true,
        getResourceServerInfo:async (_ctx,requestedResource,client)=>{
          if(requestedResource!==resource||client?.clientId!==clientId)
            throw Error('unapproved_mcp_resource');
          return {
            scope:ORCA_READ_SCOPE,audience:resource,
            accessTokenTTL:300,accessTokenFormat:'jwt',
            jwt:{sign:{alg:'ES256',kid}}
          };
        },
        // No implicit default audience: RFC 8707 resource parameter
        // must be provided by clients in both authorization and token calls.
        defaultResource:async()=>undefined,
        useGrantedResource:async()=>false
      }
    },
    interactions:{url:()=>interactionUrl},
    issueRefreshToken:()=>false // Disabled until rotation + grant revocation are implemented.
  };
}
