import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const html=read('orca-oauth-connections.html');
const account=read('account.html');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const runnable=script.replace(/^\s*import[^\n]*;\s*$/gm,'');

test('Staging-only grant manager is syntactically valid and bound to the existing ORCA project',()=>{
  assert.doesNotThrow(()=>new Function(runnable));
  assert.match(script,/selectSupabaseConfig\(\)/);
  assert.match(script,/cfg\.isOrcaStaging/);
  assert.match(script,/exactStaging='vbziibatnejoswsdggga\.supabase\.co'/);
  assert.match(script,/client\.auth\.getUser\(\)/);
  assert.match(script,/data\.user\.id!==verifiedOwnerId/);
  assert.match(html,/\[hidden\]\{display:none!important\}/);
});

test('User must explicitly confirm an OAuth grant ID returned for their account before revoking',()=>{
  assert.match(script,/client\.auth\.oauth\.listGrants\(\)/);
  assert.match(script,/listed\.set\(id,grant\)/);
  assert.match(script,/uuid\.test\(id\)/);
  assert.match(script,/disconnect\.addEventListener\('click'/);
  assert.match(script,/confirm\.addEventListener\('click',\(\)=>revoke\(id\)\)/);
  assert.match(script,/if\(busy\|\|!client\|\|!listed\.has\(clientId\)\|\|!uuid\.test\(clientId\)\)return/);
  assert.match(script,/await verifySameOwner\(\)/);
  assert.match(script,/client\.auth\.oauth\.revokeGrant\(\{clientId\}\)/);
  assert.match(script,/updated\.data\.some\(grant=>grant\?\.client\?\.id===clientId\)/);
  assert.match(script,/replaceChildren\(\)/);
  assert.match(script,/name\.textContent=/);
});

test('No secret, generated connection, silent approval, token display, or unrelated research mutation',()=>{
  assert.doesNotMatch(runnable.replace(/^\s*\/\/.*$/gm,''),/service_role|auth\.admin|client_secret|refresh_token|access_token|console\.log|localStorage\.setItem/);
  assert.doesNotMatch(script,/approveAuthorization|createClient.*service|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(html,/may remain valid until expiry/);
  assert.match(script,/no success is assumed/);
});

test('Sign-in return path is exact, allowlisted, and cannot use an arbitrary redirect',()=>{
  const allowedReturnTargets=(account.match(/const stagingReturnTo=isOrcaStaging[\s\S]*?\?\(\[([^\]]+)\]\.includes\(returnTo\)/)||[])[1]||'';
  assert.ok(allowedReturnTargets.split(',').map(value=>value.trim()).includes("'orca-oauth-connections.html'"),'Exact sign-in return target must be allowlisted');
  assert.match(script,/next\.searchParams\.set\('returnTo','orca-oauth-connections\.html'\)/);
  assert.doesNotMatch(script,/\b(?:location|window\.location)\.assign\(/);
});
