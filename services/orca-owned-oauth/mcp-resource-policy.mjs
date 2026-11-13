// ORCA-owned read-only MCP resource authorization boundary (code only).
// A deployed server must call this BEFORE any read-only tool executes.
// Never send this ORCA-issued JWT to Supabase as a Supabase user bearer.
import {verifyBoundAccessToken} from './bound-token.mjs';

export function makeProtectedResourceMetadata({issuer,resource}={}){
  if(typeof issuer!=='string'||!issuer.startsWith('https://')||
     typeof resource!=='string'||!resource.startsWith('https://')||
     issuer===resource)throw Error('invalid_owned_resource_metadata');
  return {resource,authorization_servers:[issuer],scopes_supported:['orca:research.read'],
    bearer_methods_supported:['header']};
}

export async function authorizeOwnedMcpRequest(request,options={}){
  const deny=reason=>({ok:false,reason});
  if(!request||typeof request.url!=='string'||typeof request.method!=='string'||
     typeof request.headers?.get!=='function')return deny('invalid_request');
  let target;
  try{target=new URL(request.url);}catch{return deny('invalid_request_url');}
  if(request.method!=='POST'||target.origin+target.pathname!==options.resource||
     target.search||target.hash)return deny('wrong_resource_or_method');
  if(target.searchParams.has('access_token')||target.searchParams.has('token'))
    return deny('bearer_must_not_be_in_url');
  const header=request.headers.get('authorization');
  if(typeof header!=='string'||!/^Bearer [A-Za-z0-9._~-]+$/.test(header))
    return deny('missing_or_invalid_bearer');
  if(!options||typeof options.currentGrant!=='function')
    return deny('grant_verification_unavailable');
  const checked=await verifyBoundAccessToken(header.slice(7),options);
  if(!checked.ok)return deny(checked.reason);
  // The returned ownerId derives only from a validated, ORCA-issued,
  // resource-bound JWT and fresh server-side grant. No request JSON owner.
  return {ok:true,ownerId:checked.ownerId,clientId:checked.clientId,
    grantId:checked.grantId};
}
