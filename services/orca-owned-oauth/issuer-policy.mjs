// ORCA-owned OAuth fallback — strict protocol gates, not an OAuth server.
// Deliberately isolated from Supabase's OAuth issuer and NOT deployed.
// For a real server, use a maintained OAuth authorization-server library;
// do not hand-roll code grants, refresh-token rotation, consent or sessions.
import { createHash, timingSafeEqual } from 'node:crypto';

export const ORCA_OWNED_ISSUER_ENABLED = false; // separate operator release gate
export const ORCA_READ_SCOPE = 'orca:research.read';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const challenge = /^[A-Za-z0-9_-]{43}$/;
const verifier = /^[A-Za-z0-9._~\-]{43,128}$/;
const state = /^[A-Za-z0-9._~\-]{16,256}$/;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uniqueKeys = (input, allowed) => object(input) &&
  Object.keys(input).every(key => allowed.includes(key)) &&
  Object.values(input).every(v => typeof v === 'string');

export function isHttpsUrl(value, {allowPath=true}={}) {
  if(typeof value!=='string') return false;
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.hash &&
      !u.search && (allowPath || (u.pathname==='/' || u.pathname==='')) &&
      u.href === value.replace(/\/$/, '') + (u.pathname==='/' ? '/' : '');
  } catch {return false;}
}

export function assessOwnedIssuerConfiguration(config) {
  const blockers=[];
  const add=(ok,reason)=>{if(!ok)blockers.push(reason);};
  add(object(config),'invalid_configuration');
  if(!object(config))return {ok:false,blockers};
  add(isHttpsUrl(config.issuer),'invalid_issuer_url');
  add(isHttpsUrl(config.resource),'invalid_resource_url');
  add(config.issuer!==config.resource,'issuer_resource_must_be_distinct');
  add(config.identityProvider==='supabase-staging' &&
    config.supabaseProject==='vbziibatnejoswsdggga','identity_provider_must_be_staging');
  add(config.signingAlgorithm==='ES256','signing_algorithm_must_be_ES256');
  add(config.persistentAdapter===true,'persistent_atomic_state_required');
  add(config.privateSigningKeyConfigured===true,'private_signing_key_required');
  add(config.consentCsrfProtection===true,'consent_csrf_protection_required');
  add(config.validatedRedirects===true,'validated_redirect_registry_required');
  add(config.revocationCheck===true,'revocation_check_required');
  // Even a perfect configuration is NOT a go-live signal. This branch is
  // code only until an operator independently lifts the release gate.
  return {ok:blockers.length===0 && ORCA_OWNED_ISSUER_ENABLED,blockers:
    ORCA_OWNED_ISSUER_ENABLED?blockers:[...blockers,'pilot_disabled']};
}

export function assessAuthorizationRequest(input,{resource,clients}={}) {
  if(!uniqueKeys(input,['client_id','redirect_uri','response_type','scope',
    'state','code_challenge','code_challenge_method','resource']))
    return {ok:false,reason:'malformed_or_unexpected_parameters'};
  if(typeof input.client_id!=='string'||!uuid.test(input.client_id) ||
      !object(clients) || !Object.hasOwn(clients,input.client_id))
    return {ok:false,reason:'unapproved_client'};
  const registered=clients[input.client_id];
  if(!Array.isArray(registered)||!registered.includes(input.redirect_uri) ||
     !isHttpsUrl(input.redirect_uri) || !registered.every(url=>isHttpsUrl(url)))
    return {ok:false,reason:'unregistered_redirect'};
  if(input.response_type!=='code')return {ok:false,reason:'code_only'};
  if(input.resource!==resource||!isHttpsUrl(resource))
    return {ok:false,reason:'wrong_resource'};
  if(input.code_challenge_method!=='S256'||!challenge.test(input.code_challenge||''))
    return {ok:false,reason:'pkce_s256_required'};
  if(!state.test(input.state||''))return {ok:false,reason:'state_required'};
  const scopes=(input.scope||'').split(' ');
  if(scopes.length===0||new Set(scopes).size!==scopes.length ||
     !scopes.includes(ORCA_READ_SCOPE)||
     scopes.some(s=>!['openid','profile',ORCA_READ_SCOPE].includes(s)))
    return {ok:false,reason:'invalid_scope'};
  return {ok:true,clientId:input.client_id,redirectUri:input.redirect_uri,
    resource:input.resource,scope:input.scope,codeChallenge:input.code_challenge};
}

// A pure gate intended to sit *behind* a standards-tested authorization-code
// storage engine. This function does not create, persist or consume codes.
export function checkCodeExchange(input, saved, expectedResource) {
  if(!uniqueKeys(input,['grant_type','code','code_verifier','client_id',
    'redirect_uri','resource']))
    return {ok:false,reason:'malformed_token_request'};
  if(!object(saved)||saved.used!==false||!Number.isFinite(saved.expiresAt)||
     saved.expiresAt <= Date.now())return {ok:false,reason:'invalid_or_expired_code'};
  if(input.grant_type!=='authorization_code'||!verifier.test(input.code_verifier||''))
    return {ok:false,reason:'invalid_grant_or_pkce'};
  if(typeof input.code!=='string'||input.code.length<32||
     input.client_id!==saved.clientId||input.redirect_uri!==saved.redirectUri||
     input.resource!==saved.resource||input.resource!==expectedResource)
    return {ok:false,reason:'client_redirect_or_resource_mismatch'};
  if(typeof saved.codeChallenge!=='string'||!challenge.test(saved.codeChallenge)||
     typeof saved.codeHash!=='string'||!challenge.test(saved.codeHash))
    return {ok:false,reason:'invalid_stored_code'};
  const presentedCodeHash=createHash('sha256').update(input.code,'utf8').digest('base64url');
  if(!timingSafeEqual(Buffer.from(presentedCodeHash),Buffer.from(saved.codeHash)))
    return {ok:false,reason:'authorization_code_mismatch'};
  const computed=createHash('sha256').update(input.code_verifier,'ascii').digest('base64url');
  if(!timingSafeEqual(Buffer.from(computed),Buffer.from(saved.codeChallenge)))
    return {ok:false,reason:'pkce_verifier_mismatch'};
  // The caller MUST atomically consume the code in persistent storage BEFORE
  // issuing a token. Pure policy success alone never authorizes issuance.
  return {ok:true};
}
