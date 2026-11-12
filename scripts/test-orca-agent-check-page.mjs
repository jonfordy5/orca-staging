import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(join(root,'agent-connection-check.html'),'utf8');
const account=readFileSync(join(root,'account.html'),'utf8');
const snippet=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const code=snippet.replace(/^\s*import\s+[^\n]+;\s*$/gm,'');

test('self-test page compiles and stays bound to Orca-staging',()=>{
  assert.ok(code,'inline test code required');
  assert.doesNotThrow(()=>new Function(code));
  assert.match(code,/vbziibatnejoswsdggga\.supabase\.co/);
  assert.match(code,/selectSupabaseConfig/);
  assert.match(page,/read-only connection test/i);
  assert.match(account,/agent-connection-check\.html/);
});

test('self-test obtains only the existing owner session and verified profile',()=>{
  assert.match(code,/client\.auth\.getUser\(\)/);
  assert.match(code,/client\.auth\.getSession\(\)/);
  assert.match(code,/active\.user\.id!==user\.id/);
  assert.match(code,/\.eq\('owner_id',user\.id\)/);
  assert.match(code,/identity\.researcher!==assignment\.researcher/);
  assert.match(code,/\.addEventListener\('click',run\)/);
});

test('self-test is read-only and never publishes tokens into the page or logs',()=>{
  assert.match(code,/post\('whoami',active\.access_token\)/);
  assert.match(code,/post\('my_assignment',active\.access_token\)/);
  assert.doesNotMatch(code,/\b(?:commons_claim_next|commons_publish|commons_set_my_research_consent|commons_set_my_independent_publishing|supabaseAdmin|service_role)\b/i);
  assert.doesNotMatch(code,/\b(?:console\.log|localStorage\.setItem|sessionStorage\.setItem|innerHTML)\b/);
  assert.doesNotMatch(code,/\b(?:accessToken|access_token)\b\s*\+\s*(?:'|")/);
  assert.match(page,/No trades, permissions changes, task claims, or publication/);
});
