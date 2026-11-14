// ORCA Plan B: verify an existing Supabase user before oidc-provider login
// and consent interactions. This is a server-side controller, NOT HTTP routing.
// The signed Supabase session MUST come from a server-verified, HttpOnly,
// Secure, SameSite browser cookie. A URL, POST field, or agent bearer must
// NEVER be accepted as a session source.
//
// IMPORTANT: Consent approval/token issuance is deliberately NOT implemented
// here; only login continuation and access-denied are enabled. The issuer's
// provider Grant and ORCA durable grant still require an atomic binding.
import {verifyExistingResearcher} from './existing-researcher.mjs';
import {assessAuthorizationRequest,ORCA_READ_SCOPE} from './issuer-policy.mjs';

const SESSION_ID=/^[A-Za-z0-9._~-]{16,256}$/;
const UID=/^[A-Za-z0-9._~-]{16,256}$/;
function required(condition,reason){if(!condition)throw Error(reason);}
function isPlainObject(x){return x&&typeof x==='object'&&!Array.isArray(x);}

export function createExistingResearcherInteractionController({
  provider,supabaseAuth,readTrustedBrowserSession,
  ownerScopedProfileRead,challenges,approvedClients,resource
}={}){
  required(provider&&typeof provider.interactionDetails==='function'&&
    typeof provider.interactionFinished==='function','provider_unavailable');
  required(supabaseAuth&&typeof supabaseAuth.getUser==='function',
    'supabase_user_verifier_unavailable');
  required(typeof readTrustedBrowserSession==='function',
    'verified_cookie_session_reader_required');
  required(typeof ownerScopedProfileRead==='function',
    'owner_scoped_profile_reader_required');
  required(challenges&&typeof challenges.prepare==='function'&&
    typeof challenges.consume==='function','persistent_csrf_required');
  required(isPlainObject(approvedClients)&&typeof resource==='string',
    'registered_clients_and_resource_required');

  async function context(req,res,expectedUid){
    required(typeof expectedUid==='string'&&UID.test(expectedUid),
      'invalid_interaction_route');
    // The session reader must authenticate/decrypt a server-only cookie.
    // Never trust an access token supplied in the interaction's request body.
    const session=await readTrustedBrowserSession(req);
    required(isPlainObject(session)&&
      typeof session.supabaseAccessToken==='string'&&
      session.supabaseAccessToken.split('.').length===3&&
      typeof session.browserSessionId==='string'&&
      SESSION_ID.test(session.browserSessionId),'verified_browser_session_required');
    const researcher=await verifyExistingResearcher({
      auth:supabaseAuth,ownerScopedProfileRead,
      supabaseBearer:session.supabaseAccessToken
    });
    const interaction=await provider.interactionDetails(req,res);
    required(isPlainObject(interaction)&&interaction.uid===expectedUid&&
      isPlainObject(interaction.params)&&isPlainObject(interaction.prompt),
      'untrusted_or_missing_interaction');
    const p=interaction.params;
    const evaluated=assessAuthorizationRequest({
      client_id:p.client_id,redirect_uri:p.redirect_uri,
      response_type:p.response_type,scope:p.scope,
      state:p.state,code_challenge:p.code_challenge,
      code_challenge_method:p.code_challenge_method,resource:p.resource
    },{resource,clients:approvedClients});
    required(evaluated.ok,'unapproved_oauth_request');
    required(['login','consent'].includes(interaction.prompt.name),
      'unsupported_interaction_prompt');
    if(interaction.prompt.name==='consent'){
      required(interaction.session?.accountId===researcher.ownerId,
        'oauth_session_owner_mismatch');
    }
    // Existing profile and current account are independently verified on
    // EVERY action, not only when the first consent page is rendered.
    return {interaction,researcher,
      browserSessionId:session.browserSessionId,clientId:evaluated.clientId};
  }

  async function prepare(req,res,{interactionUid}={}){
    const {interaction,researcher,browserSessionId,clientId}=
      await context(req,res,interactionUid);
    const challenge=await challenges.prepare({
      ownerId:researcher.ownerId,clientId,interactionUid,
      browserSessionId
    });
    required(typeof challenge.challengeId==='string'&&
      typeof challenge.csrfToken==='string','csrf_issue_failed');
    return Object.freeze({
      prompt:interaction.prompt.name,interactionUid,clientId,
      scope:ORCA_READ_SCOPE,resource,
      challengeId:challenge.challengeId,csrfToken:challenge.csrfToken
    });
  }

  async function consume(req,res,form,expectedPrompt){
    required(isPlainObject(form)&&typeof form.interactionUid==='string'&&
      typeof form.challengeId==='string'&&typeof form.csrfToken==='string',
      'invalid_consent_submission');
    const {interaction,researcher,browserSessionId,clientId}=
      await context(req,res,form.interactionUid);
    required(interaction.prompt.name===expectedPrompt,
      'interaction_phase_mismatch');
    const ok=await challenges.consume({
      challengeId:form.challengeId,csrfToken:form.csrfToken,
      ownerId:researcher.ownerId,clientId,
      interactionUid:form.interactionUid,browserSessionId
    });
    required(ok===true,'csrf_rejected_or_replayed');
    return {interaction,researcher};
  }

  async function continueVerifiedLogin(req,res,form){
    const {researcher}=await consume(req,res,form,'login');
    // Unlike a demo account/password route, this derives only from the
    // fresh, server-verified existing Supabase account. No alias changes.
    await provider.interactionFinished(req,res,{
      login:{accountId:researcher.ownerId}
    },{mergeWithLastSubmission:false});
    return {continued:true};
  }

  async function denyWithVerifiedSession(req,res,form){
    const {interaction}=await consume(req,res,form,
      form?.expectedPrompt==='login'?'login':'consent');
    await provider.interactionFinished(req,res,{
      error:'access_denied'
    },{mergeWithLastSubmission:false});
    return {denied:true,prompt:interaction.prompt.name};
  }

  // This returns a validated one-time consent event to the INTERNAL
  // finalizer, not a public authorize/approve endpoint. The finalizer must
  // still persist and link the provider + ORCA grants before it resumes.
  async function consumeVerifiedConsent(req,res,form){
    return consume(req,res,form,'consent');
  }

  return Object.freeze({
    prepare,continueVerifiedLogin,denyWithVerifiedSession,
    consumeVerifiedConsent
  });
}
