// ORCA staging OAuth consent policy. Fail closed until the release checklist is signed off.
// This public file contains no secrets. Both the browser and server must authorize
// the exact same vetted OAuth client. This check is defense in depth: it is not a
// substitute for the staging private client registry / PostgREST gate.
export const ORCA_OAUTH_CONSENT_ENABLED = false;

// Change only after the operator validates an exact ChatGPT callback URI AND the
// registered Supabase client ID. Empty by default — no client can be authorized.
export const APPROVED_OAUTH_CLIENT_REDIRECTS = Object.freeze({});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authorizeConsentRequest(details) {
  if (!ORCA_OAUTH_CONSENT_ENABLED) return {ok:false,reason:'pilot_disabled'};
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {ok:false,reason:'invalid_request'};
  }
  const clientId=details.client?.id;
  if (typeof clientId !== 'string' || !uuid.test(clientId)) {
    return {ok:false,reason:'invalid_client'};
  }
  if (!Object.hasOwn(APPROVED_OAUTH_CLIENT_REDIRECTS,clientId)) {
    return {ok:false,reason:'client_not_approved'};
  }
  const approvedRedirect=APPROVED_OAUTH_CLIENT_REDIRECTS[clientId];
  const submittedRedirect=details.redirect_uri;
  if (typeof approvedRedirect!=='string' || !approvedRedirect ||
    typeof submittedRedirect!=='string' || submittedRedirect!==approvedRedirect) {
    return {ok:false,reason:'callback_not_approved'};
  }
  try {
    const url=new URL(submittedRedirect);
    if (url.protocol!=='https:' || !url.hostname || url.username || url.password ||
      url.hash || url.href!==submittedRedirect) {
      return {ok:false,reason:'callback_not_approved'};
    }
  } catch{return {ok:false,reason:'callback_not_approved'};}
  if (typeof details.authorization_id!=='string' || details.authorization_id.length<16) {
    return {ok:false,reason:'invalid_authorization'};
  }
  return {ok:true,reason:'approved'};
}
