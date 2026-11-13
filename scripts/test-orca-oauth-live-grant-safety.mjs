import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ORCA_OAUTH_CONSENT_ENABLED, APPROVED_OAUTH_CLIENT_REDIRECTS,authorizeConsentRequest,assessVettedConsent} from './orca-oauth-consent-policy.mjs';
import {hasCurrentOAuthGrant} from '../supabase/functions/orca-agent-mcp/grant-policy.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const consent=readFileSync(join(root,'orca-oauth-consent.html'),'utf8');
const mcp=readFileSync(join(root,'supabase/functions/orca-agent-mcp/index.ts'),'utf8');
const exampleId='11111111-2222-4333-8444-555555555555';
const otherId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const baseGrant={client:{id:exampleId},scopes:['openid','profile'],granted_at:'2026-11-12T15:00:00Z'};

test('Consent is disabled for all clients including fabricated metadata, until separately activated',()=>{
  assert.equal(ORCA_OAUTH_CONSENT_ENABLED,false);
  assert.deepEqual(Object.keys(APPROVED_OAUTH_CLIENT_REDIRECTS),[]);
  for(const request of [null,{}, {
    authorization_id:'a'.repeat(40),
    client:{id:exampleId,name:'ChatGPT'},
    redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect'
  }]) assert.equal(authorizeConsentRequest(request).ok,false);
});

test('A future approved pilot accepts only an exact client ID, HTTPS callback and valid authorization ID',()=>{
  const callback='https://chatgpt.com/connector_platform_oauth_redirect';
  const vetted={enabled:true,approvedClientRedirects:{[exampleId]:callback}};
  const request={client:{id:exampleId},redirect_uri:callback,authorization_id:'abcdefghijklmnopqrstuvwxyz123456'};
  assert.deepEqual(assessVettedConsent(request,vetted),{ok:true,reason:'approved'});
  for(const bad of [
    {...request,client:{id:otherId}},
    {...request,client:{id:exampleId+'x'}},
    {...request,redirect_uri:'https://attacker.example/callback'},
    {...request,redirect_uri:'http://chatgpt.com/connector_platform_oauth_redirect'},
    {...request,redirect_uri:callback+'?code=leak'},
    {...request,authorization_id:'short'},
    {...request,client:null},
    null
  ])assert.equal(assessVettedConsent(bad,vetted).ok,false);
  assert.equal(assessVettedConsent(request,{enabled:true,approvedClientRedirects:{}}).ok,false);
  assert.equal(assessVettedConsent(request,{enabled:false,approvedClientRedirects:{[exampleId]:callback}}).ok,false);
});

test('A user-scoped, current grant must match the verified OAuth client exactly',()=>{
  assert.equal(hasCurrentOAuthGrant([baseGrant],exampleId),true);
  for(const [grants,clientId] of [
    [[],exampleId],[null,exampleId],[{},exampleId],
    [[baseGrant],otherId],[[baseGrant],''],
    [[{...baseGrant,client:{id:otherId}}],exampleId],
    [[{...baseGrant,granted_at:'not-a-date'}],exampleId],
    [[{...baseGrant,scopes:null}],exampleId],
    [[{...baseGrant,revoked:true}],exampleId],
    [[{...baseGrant,revoked_at:'2026-11-12T18:00:00Z'}],exampleId],
    [[{client:{id:exampleId}}],exampleId]
  ]) assert.equal(hasCurrentOAuthGrant(grants,clientId),false);
});

test('Consent page refuses approval when disabled and checks a vetted request again on click',()=>{
  assert.match(consent,/ORCA_OAUTH_CONSENT_ENABLED/);
  assert.match(consent,/authorizeConsentRequest\(details\)/);
  assert.match(consent,/authorizeConsentRequest\(reviewedRequest\)/);
  assert.match(consent,/if\(!ORCA_OAUTH_CONSENT_ENABLED\)/);
  assert.match(consent,/skipBrowserRedirect:true/);
  assert.match(consent,/id="approve" type="button" disabled/);
});

test('Every MCP read checks verified subject then the live OAuth grant endpoint using same bearer',()=>{
  assert.match(mcp,/authorizeReadOnlyMcpClaims/);
  assert.match(mcp,/hasCurrentOAuthGrant/);
  assert.match(mcp,/readCurrentGrants\(req\)/);
  assert.match(mcp,/if\s*\(!hasCurrentOAuthGrant\(grants,\s*claims.client_id\)\)/);
  assert.match(mcp,/\/user\/oauth\/grants/);
  assert.match(mcp,/redirect:'error'/);
  assert.match(mcp,/credentials:'omit'/);
  assert.match(mcp,/SUPABASE_ANON_KEY/);
  assert.doesNotMatch(mcp,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|auth\.admin\./);
});
