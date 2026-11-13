// Public, credential-free readiness check for the ORCA Commons MCP connection.
// This is informational; NOTHING here authorizes an agent, creates a client,
// requests a token, reads a user account, or deploys a Supabase function.
import {
  ORCA_STAGING_PROJECT, ORCA_STAGING_ISSUER, ORCA_STAGING_RESOURCE,
  ORCA_STAGING_RESOURCE_METADATA, ORCA_STAGING_AUTH_METADATA,
  ORCA_AGENT_OAUTH_PILOT_ENABLED, assessOAuthDiscovery
} from './orca-oauth-readiness.mjs';

const endpoints=[
  ['MCP protected-resource metadata',ORCA_STAGING_RESOURCE_METADATA],
  ['OAuth server metadata',ORCA_STAGING_AUTH_METADATA],
  ['Auth OpenID metadata',ORCA_STAGING_ISSUER+'/.well-known/openid-configuration'],
  ['Public JWKS',ORCA_STAGING_ISSUER+'/.well-known/jwks.json']
];

const results=new Map();
for(const [label,url] of endpoints){
  try{
    const response=await fetch(url,{
      method:'GET',headers:{Accept:'application/json'},
      credentials:'omit',cache:'no-store',redirect:'error',
      signal:AbortSignal.timeout(10000)
    });
    const data=response.ok?await response.json().catch(()=>null):null;
    const validJson=data!==null&&typeof data==='object'&&!Array.isArray(data);
    results.set(label,{status:response.status,data:validJson?data:null});
    console.log(label+': HTTP '+response.status+
      (validJson?' · JSON parsed':' · unavailable or invalid JSON'));
  }catch{
    results.set(label,{status:null,data:null});
    console.log(label+': no valid public response');
  }
}

const resource=results.get('MCP protected-resource metadata')?.data;
const authorization=results.get('OAuth server metadata')?.data;
const openId=results.get('Auth OpenID metadata')?.data;
const jwks=results.get('Public JWKS')?.data;

const decision=assessOAuthDiscovery(resource,authorization);
const asymmetricKeys=Array.isArray(jwks?.keys)?jwks.keys.filter(
  key=>key&&typeof key==='object'&&['RSA','EC','OKP'].includes(key.kty)
):[];
console.log('Staging project: '+ORCA_STAGING_PROJECT);
console.log('Expected MCP resource: '+ORCA_STAGING_RESOURCE);
console.log('Exact metadata URL: '+ORCA_STAGING_RESOURCE_METADATA);
console.log('Resource/issuer/PKCE metadata passed: '+decision.metadataReady);
console.log('Missing/invalid metadata: '+(decision.reasons.join(', ')||'none'));
console.log('OpenID issuer agrees: '+(openId?.issuer===ORCA_STAGING_ISSUER));
console.log('JWKS asymmetric public signing keys: '+asymmetricKeys.length);
console.log('Independent OAuth release gate enabled: '+ORCA_AGENT_OAUTH_PILOT_ENABLED);
console.log('A correctly resource-bound OAuth access token has NOT been proved.');
console.log('No ChatGPT identity, client registration, consent, refresh token, or research writes were attempted.');
console.log('Read-only connection availability: NOT VERIFIED by public metadata.');
// No exit(1) for an intentionally disabled or undeployed staging prototype.
// CI tests validate strict matching of known-good mock metadata separately.
