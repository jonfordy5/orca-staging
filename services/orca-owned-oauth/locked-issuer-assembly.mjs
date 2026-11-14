// ORCA Stage 21 — assemble the maintained OAuth issuer components, OFF.
// NO public listener, Supabase call on construction, or embedded secrets.
// A separately reviewed activation entrypoint is mandatory.
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {ORCA_OWNED_ISSUER_ENABLED} from './issuer-policy.mjs';
import {buildOidcProviderProposal} from './oidc-provider-proposal.mjs';
import {makeEncryptedPgOidcAdapter} from './encrypted-pg-oidc-adapter.mjs';
import {createOwnedGrantRegistry} from './grant-registry.mjs';
import {createPrivateConsentChallenges} from './consent-challenge.mjs';
import {
  createOpaqueBrowserSessionBridge,createPrivatePostgresSessionStore
} from './opaque-browser-session.mjs';
import {createExistingResearcherInteractionController} from './existing-researcher-interaction.mjs';
import {createSafeConsentFinalizer} from './consent-finalization.mjs';
import {createOrcaIssuerInteractionHttp} from './interaction-http-routes.mjs';
import {createIssuerPrivateQuery} from './issuer-private-query.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KID=/^[A-Za-z0-9_-]{8,48}$/;
const CLIENT=/^[\x21-\x7e]{1,512}$/;
const deny=()=>{throw Error('stage21_verified_offline_issuer_configuration_required');};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function origin(value){
  if(typeof value!=='string')deny();
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.origin!==value||u.username||u.password||
       u.pathname!=='/'||u.search||u.hash)deny();
    return u.origin;
  }catch{deny();}
}
function exactHttps(value){
  if(typeof value!=='string')deny();
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
       u.href!==value)deny();
    return u.href;
  }catch{deny();}
}
function validatedSigningJwk(jwk,kid){
  if(!obj(jwk)||!KID.test(kid)||jwk.kty!=='EC'||jwk.crv!=='P-256'||
     typeof jwk.x!=='string'||typeof jwk.y!=='string'||
     typeof jwk.d!=='string'||jwk.d.length!==43||
     (jwk.alg!==undefined&&jwk.alg!=='ES256')||
     (jwk.use!==undefined&&jwk.use!=='sig')||
     (jwk.kid!==undefined&&jwk.kid!==kid))deny();
  try{
    const key=createPrivateKey({key:jwk,format:'jwk'});
    if(key.asymmetricKeyType!=='ec'||
       key.asymmetricKeyDetails?.namedCurve!=='prime256v1')deny();
    const pub=createPublicKey(key).export({format:'jwk'});
    if(pub.x!==jwk.x||pub.y!==jwk.y)deny();
    return {...key.export({format:'jwk'}),kid,alg:'ES256',use:'sig'};
  }catch{deny();}
}
function validatedCookieKeys(keys){
  if(!Array.isArray(keys)||keys.length<2||keys.length>3)deny();
  const unique=new Set();
  for(const k of keys){
    if(typeof k!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(k)||
       Buffer.from(k,'base64url').length<32||
       Buffer.from(k,'base64url').toString('base64url')!==k||
       unique.has(k))deny();
    unique.add(k);
  }
  return [...keys];
}
function validatedKeyring(keyring,currentKeyId){
  if(!obj(keyring)||!KID.test(currentKeyId)||
     !(keyring[currentKeyId] instanceof Uint8Array)||
     keyring[currentKeyId].byteLength!==32)deny();
  for(const [id,key] of Object.entries(keyring)){
    if(!KID.test(id)||!(key instanceof Uint8Array)||key.byteLength!==32)
      deny();
  }
  return Object.fromEntries(Object.entries(keyring).map(([k,v])=>
    [k,Buffer.from(v)]));
}
function unavailable(res){
  if(res?.headersSent||res?.writableEnded)return;
  res.writeHead(503,{
    'content-type':'application/json',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'"
  });
  res.end('{"error":"orca_issuer_not_deployed"}');
}

/**
 * verifiedIssuerConnector must be the Stage 20 issuer-only TLS+role-verified connector.
 * supabaseUserAdapter must authenticate a current user using Supabase Auth
 * and read only that user's opted-in, RLS-protected researcher profile.
 *
 * No provider callback, signing key, DB adapter or enabled route is returned.
 * This module can NEVER activate OAuth through an environment flag.
 */
export function createStage21LockedIssuerAssembly({
  ProviderClass,issuerOrigin,mcpResource,clientId,redirectUri,
  signingKid,privateSigningJwk,providerCookieKeys,
  providerEncryptionKeyId,providerEncryptionKeyring,
  browserSessionKeyring,verifiedIssuerConnector,supabaseUserAdapter,
  isTrustedHttps=req=>req?.socket?.encrypted===true
}={}){
  if(ORCA_OWNED_ISSUER_ENABLED!==false)deny();
  if(typeof ProviderClass!=='function'||typeof verifiedIssuerConnector?.connect!=='function'||
     typeof isTrustedHttps!=='function'||!obj(supabaseUserAdapter)||
     typeof supabaseUserAdapter.auth?.getUser!=='function'||
     typeof supabaseUserAdapter.ownerScopedProfileRead!=='function')
    deny();
  const issuer=origin(issuerOrigin);
  const resource=exactHttps(mcpResource);
  const callback=exactHttps(redirectUri);
  if(new URL(resource).origin===issuer||!CLIENT.test(clientId||''))deny();
  const jwk=validatedSigningJwk(privateSigningJwk,signingKid);
  const cookies=validatedCookieKeys(providerCookieKeys);
  const providerKeys=validatedKeyring(providerEncryptionKeyring,providerEncryptionKeyId);
  if(!Array.isArray(browserSessionKeyring)||
     browserSessionKeyring.length<1||browserSessionKeyring.length>3)deny();
  const usedKeys=new Set(Object.values(providerKeys).map(k=>k.toString('hex')));
  for(const record of browserSessionKeyring){
    if(!obj(record)||!KID.test(record.id)||
       !(record.key instanceof Uint8Array)||record.key.byteLength!==32||
       usedKeys.has(Buffer.from(record.key).toString('hex')))deny();
  }
  // Every private operation uses a fresh, verified issuer-only connection
  // and a bounded transaction. An arbitrary SQL callback is never accepted.
  const issuerQuery=createIssuerPrivateQuery({connector:verifiedIssuerConnector});
  const adapter=makeEncryptedPgOidcAdapter({
    query:issuerQuery,currentKeyId:providerEncryptionKeyId,keyring:providerKeys
  });
  const grants=createOwnedGrantRegistry({query:issuerQuery,resource});
  const challenges=createPrivateConsentChallenges({query:issuerQuery,resource});
  const sessionStore=createPrivatePostgresSessionStore({query:issuerQuery});
  const session=createOpaqueBrowserSessionBridge({
    issuerOrigin:issuer,keyring:browserSessionKeyring,store:sessionStore,
    auth:supabaseUserAdapter.auth,
    ownerScopedProfileRead:supabaseUserAdapter.ownerScopedProfileRead,
    isTrustedHttps
  });
  const config=buildOidcProviderProposal({
    resource,clientId,redirectUri:callback,kid:signingKid,
    persistentAdapter:adapter,
    findAccount:async(_ctx,id)=>{
      if(typeof id!=='string'||!UUID.test(id))return undefined;
      return {accountId:id,claims:async()=>({sub:id})};
    },
    interactionUrl:'/interaction/invalid',
    lookupOwnedGrant:grants.lookupOwnedGrant
  });
  config.interactions={url:(_ctx,interaction)=>'/interaction/'+interaction.uid};
  config.jwks={keys:[jwk]};
  config.cookies={keys:cookies};
  config.ttl={AccessToken:300};
  const provider=new ProviderClass(issuer,config);
  if(typeof provider?.interactionDetails!=='function'||
     typeof provider?.interactionFinished!=='function'||
     typeof provider?.callback!=='function'||typeof provider?.Grant!=='function')
    deny();
  const controller=createExistingResearcherInteractionController({
    provider,supabaseAuth:supabaseUserAdapter.auth,
    readTrustedBrowserSession:session.readTrustedBrowserSession,
    ownerScopedProfileRead:supabaseUserAdapter.ownerScopedProfileRead,
    challenges,approvedClients:{[clientId]:[callback]},resource
  });
  const consentFinalizer=createSafeConsentFinalizer({
    controller,provider,grantRegistry:grants,resource
  });
  // Create the true interaction adapter locked; no real route may serve.
  const lockedInteraction=createOrcaIssuerInteractionHttp({
    enabled:false,issuerOrigin:issuer,isTrustedHttps,
    sessionBridge:session,controller,consentFinalizer
  });
  return Object.freeze({
    issuer,resource,clientId,redirectUri:callback,
    mode:'locked-staging',publicAuthorizationEnabled:false,
    async handle(req,res){
      if(typeof req?.url==='string'&&
         req.url.startsWith('/interaction/'))
        return lockedInteraction(req,res);
      unavailable(res);
    }
  });
}
