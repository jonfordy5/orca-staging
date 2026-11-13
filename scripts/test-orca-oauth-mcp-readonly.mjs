import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)), '..');
const read=path=>readFileSync(join(root,path),'utf8');
const mcp=read('supabase/functions/orca-agent-mcp/index.ts');
const consent=read('orca-oauth-consent.html');
const account=read('account.html');
const config=read('supabase/config.toml');
const script=consent.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const code=script.replace(/^\s*import[^\n]*;\s*$/gm,'');

test('MCP uses official OAuth resource metadata and verified user middleware before exposing tools',()=>{
  assert.match(mcp,/withOAuthProtectedResource\(\)/);
  assert.match(mcp,/withSupabase\(\{ auth: 'user' \}\)/);
  assert.ok(mcp.indexOf('withOAuthProtectedResource()')<mcp.indexOf("withSupabase({ auth: 'user' })"));
  assert.match(mcp,/auth\.getClaims\(\)/);
  assert.match(mcp,/import \{ authorizeReadOnlyMcpClaims, ORCA_MCP_STAGING_ISSUER \} from '\.\/token-policy\.mjs'/);
  assert.match(mcp,/import \{ hasCurrentOAuthGrant \} from '\.\/grant-policy\.mjs'/);
  assert.match(mcp,/ORCA_MCP_APPROVED_CLIENT_IDS/);
  assert.match(mcp,/auth\.getUser\(\)/);
  assert.match(mcp,/authorizeReadOnlyMcpClaims\([\s\S]*?claims, allowedClients, identity\.data\.user\.id/);
  assert.match(mcp,/if \(!decision\.ok\)/);
  assert.match(mcp,/readAgentState\(supabase, ownerId/);
  const tokenPolicy=read('supabase/functions/orca-agent-mcp/token-policy.mjs');
  assert.match(tokenPolicy,/ORCA_MCP_STAGING_ISSUER/);
  assert.match(tokenPolicy,/ORCA_MCP_STAGING_RESOURCE/);
  assert.match(tokenPolicy,/audiences\.includes\(ORCA_MCP_STAGING_RESOURCE\)/);
  assert.match(tokenPolicy,/allowedClientIds\.has\(clientId\)/);
  assert.match(tokenPolicy,/claims\.sub !== verifiedUserId/);
  const executableMcp=mcp.replace(/^\s*\/\/.*$/gm,'');
  assert.doesNotMatch(executableMcp, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|service_role|auth\.admin|createClient\(/);
});

test('MCP exposes exactly two read-only tools and no claims, publish, permission, or broker mutations',()=>{
  const tools=[...mcp.matchAll(/server\.registerTool\(\s*'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(tools,['orca_whoami','orca_my_assignment']);
  assert.equal((mcp.match(/readOnlyHint: true/g)||[]).length,2);
  assert.equal((mcp.match(/securitySchemes: \[\{ type: 'oauth2', scopes: \[\] \}\]/g)||[]).length,2);
  assert.doesNotMatch(mcp, /rpc\(|\.insert\(|\.update\(|\.delete\(|commons_publish|commons_claim|set_my_research_consent|set_my_independent_publishing/);
  assert.match(mcp,/\bticker: z\.string\(\)\.min\(1\)\.max\(10\)/);
});

test('Only MCP discovery bypasses gateway JWT; signed-in read-only browser endpoint still requires JWT',()=>{
  assert.match(config,/\[functions\.orca-agent-readonly\]\s*verify_jwt = true/);
  assert.match(config,/\[functions\.orca-agent-mcp\]\s*verify_jwt = false/);
  assert.doesNotMatch(config,/\[auth\.oauth_server\]\s*enabled\s*=\s*true/);
  assert.match(mcp,/withSupabase\(\{ auth: 'user' \}\)/);
});

test('Consent page is syntactically sound and cannot approve without a real user decision',()=>{
  assert.ok(code.length>400);
  assert.doesNotThrow(()=>new Function(code));
  assert.match(code,/client\.auth\.getUser\(\)/);
  assert.match(code,/client\.auth\.oauth\.getAuthorizationDetails\(authorizationId\)/);
  assert.match(code,/client\.auth\.oauth\.approveAuthorization\(authorizationId,\{skipBrowserRedirect:true\}\)/);
  assert.match(code,/client\.auth\.oauth\.denyAuthorization\(authorizationId,\{skipBrowserRedirect:true\}\)/);
  assert.match(code,/\$\('approve'\)\.addEventListener\('click',\(\)=>decide\(true\)\)/);
  assert.match(code,/if\(!ORCA_OAUTH_CONSENT_ENABLED\)/);
  assert.match(code,/authorizeConsentRequest\(reviewedRequest\)/);
  assert.match(code,/\$\('deny'\)\.addEventListener\('click',\(\)=>decide\(false\)\)/);
  assert.match(consent,/id="approve" type="button" disabled/);
  assert.match(consent,/id="deny" type="button" class="secondary" disabled/);
  assert.match(consent,/\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(code,/localStorage\.setItem\(|sessionStorage\.setItem\(|console\.log\(|user\.email\s*===/);
});

test('Existing ORCA sign-in continues only to exact consent path with validated authorization identifier',()=>{
  const allowedReturnTargets=(account.match(/const stagingReturnTo=isOrcaStaging[\s\S]*?\?\(\[([^\]]+)\]\.includes\(returnTo\)/)||[])[1]||'';
  assert.ok(allowedReturnTargets.split(',').map(value=>value.trim()).includes("'orca-oauth-consent.html'"),'Exact sign-in return target must be allowlisted');
  assert.match(account,/validAuthorizationId=\/\^\[a-zA-Z0-9_\-\]\{16,256\}\$\//);
  assert.match(account,/authReturnParams=stagingReturnTo==='orca-oauth-consent\.html'&&validAuthorizationId/);
  assert.match(account,/orcaStagingHref\('\.\/'\+stagingReturnTo,authReturnParams\)/);
  assert.match(consent,/returnTo','orca-oauth-consent\.html'/);
  assert.doesNotMatch(consent,/\bid="password"|client_secret|refresh_token|access_token/);
});
