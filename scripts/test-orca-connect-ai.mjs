import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import { assessOAuthDiscovery, ORCA_AGENT_OAUTH_PILOT_ENABLED,
  ORCA_STAGING_RESOURCE, ORCA_STAGING_ISSUER, ORCA_STAGING_PROJECT } from './orca-oauth-readiness.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(join(root,'orca-connect-ai.html'),'utf8');
const account=readFileSync(join(root,'account.html'),'utf8');
const script=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const runnable=script.replace(/^\s*import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm,'')
                     .replace(/^\s*import[^\n]*;\s*$/gm,'');
const validResource={
  resource:ORCA_STAGING_RESOURCE,authorization_servers:[ORCA_STAGING_ISSUER]
};
const validAuth={
  issuer:ORCA_STAGING_ISSUER,
  response_types_supported:['code'],
  code_challenge_methods_supported:['S256'],
  authorization_endpoint:ORCA_STAGING_PROJECT+'/auth/v1/oauth/authorize',
  token_endpoint:ORCA_STAGING_PROJECT+'/auth/v1/oauth/token',
  registration_endpoint:ORCA_STAGING_PROJECT+'/auth/v1/oauth/clients'
};

test('Exactly bound resource/issuer and PKCE S256 are required, without treating metadata as an authorized connection',()=>{
  const good=assessOAuthDiscovery(validResource,validAuth);
  assert.equal(good.metadataReady,true);
  assert.equal(good.connectionReady,false);
  assert.equal(ORCA_AGENT_OAUTH_PILOT_ENABLED,false);
  for(const [r,a] of [
    [{...validResource,resource:'https://evil.example/mcp'},validAuth],
    [{...validResource,authorization_servers:['https://evil.example']},validAuth],
    [validResource,{...validAuth,issuer:'https://evil.example'}],
    [validResource,{...validAuth,code_challenge_methods_supported:['plain']}],
    [validResource,{...validAuth,response_types_supported:['token']}],
    [validResource,{...validAuth,registration_endpoint:'https://evil.example/register'}],
    [validResource,{...validAuth,authorization_endpoint:'http://evil.example/auth'}],
    [validResource,{...validAuth,token_endpoint:ORCA_STAGING_PROJECT+'/auth/v1/oauth/token?leak=1'}],
    [null,validAuth],
    [validResource,null],
  ])assert.equal(assessOAuthDiscovery(r,a).metadataReady,false);
});

test('Connection screen is valid JS, signed-in user is looked up by verified owner, and no writes happen',()=>{
  assert.ok(script.length>1500);
  assert.doesNotThrow(()=>new Function(runnable));
  assert.match(script,/client\.auth\.getUser\(\)/);
  assert.match(script,/\.eq\('owner_id',ownerId\)\.maybeSingle\(\)/);
  assert.match(script,/fetchPublicJson\(ORCA_STAGING_RESOURCE_METADATA\)/);
  assert.match(script,/fetchPublicJson\(ORCA_STAGING_AUTH_METADATA\)/);
  assert.match(script,/credentials:'omit'/);
  assert.match(script,/redirect:'error'/);
  assert.match(script,/assessOAuthDiscovery\(resource,auth\)/);
  assert.match(script,/if\(!decision\.connectionReady\)/);
  assert.match(script,/navigator\.clipboard\.writeText\(ORCA_STAGING_RESOURCE\)/);
  assert.doesNotMatch(script,/approveAuthorization|revokeGrant|\.rpc\(|\.insert\(|\.update\(|\.delete\(|auth\.admin|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Login return path is allowlisted and the UI never confuses copy with authorization',()=>{
  assert.match(account,/'orca-connect-ai\.html'\]\.includes\(returnTo\)/);
  assert.match(page,/copying an address does not connect an agent/i);
  assert.match(page,/This is not an authorized or connected account/i);
  assert.match(page,/orca-oauth-connections\.html/);
  assert.match(page,/connect-work\.html/);
  assert.match(page,/\[hidden\]\{display:none!important\}/);
});
