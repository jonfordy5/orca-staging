// Public, credential-free ORCA staging OAuth discovery preflight.
//
// No user identities, token exchange, cookies, credentials, database writes,
// OAuth registration, or authorization requests are performed.
// Discovery is informational until a genuine resource-bound JWT exchange is
// explicitly approved and verified.
const project='https://vbziibatnejoswsdggga.supabase.co';
const issuer=project+'/auth/v1';
const expectedResource=project+'/functions/v1/orca-agent-mcp';

const endpoints=[
  ['OAuth server metadata',project+'/.well-known/oauth-authorization-server/auth/v1'],
  ['Auth OpenID metadata',issuer+'/.well-known/openid-configuration'],
  ['Public JWKS',issuer+'/.well-known/jwks.json']
];
for (const [name,url] of endpoints) {
  const response=await fetch(url,{
    method:'GET',headers:{Accept:'application/json'},
    redirect:'error',signal:AbortSignal.timeout(12000)
  });
  let data=null;
  if(response.ok) {
    try { data=await response.json(); } catch { /* invalid metadata */ }
  }
  console.log(name+': HTTP '+response.status);
  if(name==='Public JWKS') {
    const keys=Array.isArray(data?.keys)?data.keys:[];
    const asym=keys.filter(k=>['RSA','EC','OKP'].includes(k.kty)).length;
    console.log('Asymmetric signing keys visible in JWKS: '+asym);
    if(!asym)console.log('GATE NOT MET: confirm asymmetric JWT signing key before MCP deployment.');
  } else if(data) {
    // Never print raw metadata containing project-specific configuration
    // beyond approved public endpoints or client IDs.
    console.log('Issuer matches expected staging Auth URL: '+(data.issuer===issuer));
    const code=Array.isArray(data.response_types_supported)&&
      data.response_types_supported.includes('code');
    const pkce=Array.isArray(data.code_challenge_methods_supported)&&
      data.code_challenge_methods_supported.includes('S256');
    console.log('Authorization-code flow advertised: '+Boolean(code));
    console.log('PKCE S256 advertised: '+Boolean(pkce));
    console.log('Client registration advertised: '+Boolean(data.registration_endpoint));
  } else {
    console.log('Discovery unavailable or no JSON; OAuth must remain disabled.');
  }
}
console.log('RFC 8707 token audience binding: NOT PROVEN BY DISCOVERY.');
console.log('Expected ORCA MCP audience: '+expectedResource);
console.log('No authorization attempted; no tokens or client registrations created.');
