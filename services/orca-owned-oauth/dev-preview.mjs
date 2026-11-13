// Loopback-only runtime integration smoke for oidc-provider@9.14.0.
// There is intentionally NO working consent/login/token exchange here.
// It proves metadata and library startup without exposing an OAuth server.
//
// To deploy a real issuer: use the audited encrypted Postgres adapter,
// private signing keys, real Supabase-login+consent interaction handlers,
// managed TLS, exact client registration, refresh rotation, CSRF, and grants.
// Never serve this preview on a public interface.
import Provider from 'oidc-provider';
import {createServer} from 'node:http';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {buildOidcProviderProposal} from './oidc-provider-proposal.mjs';

export const PREVIEW_ISSUER='https://orca-owned-preview.invalid';
export const PREVIEW_RESOURCE='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
export const PREVIEW_CLIENT_ID='orca-owned-issuer-local-smoke';
export const PREVIEW_CALLBACK='https://example.invalid/orca-callback';

const key=()=>randomBytes(32).toString('base64url');
function unavailable(){throw Error('preview_state_is_disabled');}
class DisabledStorage {
  async upsert(){unavailable();}
  async find(){return undefined;}
  async findByUid(){return undefined;}
  async findByUserCode(){return undefined;}
  async consume(){unavailable();}
  async destroy(){unavailable();}
  async revokeByGrantId(){unavailable();}
}

export function buildLocalPreviewProvider(){
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const jwk=privateKey.export({format:'jwk'});
  const kid='orca-local-preview-'+key().slice(0,14);
  const policy=buildOidcProviderProposal({
    resource:PREVIEW_RESOURCE,clientId:PREVIEW_CLIENT_ID,
    redirectUri:PREVIEW_CALLBACK,kid,
    persistentAdapter:DisabledStorage,
    findAccount:async()=>undefined, // no users or grants in this preview
    interactionUrl:'/interaction/unavailable'
  });
  const configuration={
    ...policy,
    jwks:{keys:[{...jwk,kid,alg:'ES256',use:'sig'}]},
    cookies:{keys:[key(),key()]},
    // Tokens cannot be obtained: no login, no consent, no persistent store.
    ttl:{AccessToken:300}
  };
  return new Provider(PREVIEW_ISSUER,configuration);
}

function reject(res,status){
  res.writeHead(status,{
    'content-type':'application/json',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(JSON.stringify({error:'preview_not_active'}));
}

export function createLocalPreviewServer(provider=buildLocalPreviewProvider()){
  const router=provider.callback();
  const discovery=new Set([
    '/.well-known/openid-configuration',
    '/.well-known/oauth-authorization-server'
  ]);
  const server=createServer((req,res)=>{
    // Strict loopback interface, method, and endpoint allowlist.
    // Even on localhost, do not let authorization/token APIs issue a bearer.
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
      return reject(res,403);
    if(req.method!=='GET' && req.method!=='HEAD')
      return reject(res,503);
    if(!req.url || !discovery.has(req.url.split('?')[0]))
      return reject(res,503);
    router(req,res);
  });
  return server;
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const server=createLocalPreviewServer();
  server.listen(0,'127.0.0.1',()=>{
    console.log('ORCA OAuth metadata-only preview on loopback port '+server.address().port);
    console.log('No login, tokens, consent, database, approved clients, or public listener.');
  });
}
