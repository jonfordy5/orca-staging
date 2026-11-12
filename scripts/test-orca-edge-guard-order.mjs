import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)), '..');
const slugs=[
  'orca-majority-synthesis','orca-timeline-discovery','orca-timeline-photo-fill',
  'orca-auto-ai-profile','orca-av-ulta-private-preview'
];
const read=slug=>readFileSync(join(root,'supabase/functions',slug,'index.ts'),'utf8');
const guard='isVerifiedOrcaBrowserToken(';
const writes=/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|\bfetch\s*\(/g;

for (const slug of slugs) {
  test(slug+' authenticates then rejects OAuth before any privileged mutation or outgoing fetch',()=>{
    const source=read(slug);
    const handlerStart=source.indexOf('Deno.serve(');
    const verify=source.indexOf('.auth.getUser(',handlerStart);
    const guardAt=source.indexOf(guard,handlerStart);
    assert.ok(handlerStart>=0 && verify>handlerStart && guardAt>verify,
      slug+': missing authenticate-then-gate order');
    const preGate=source.slice(handlerStart,guardAt);
    const mutation=preGate.match(writes);
    assert.equal(mutation,null,slug+': privileged mutation or HTTP fetch before OAuth guard: '+mutation);
    assert.match(source.slice(guardAt,guardAt+180),/oauth_client_not_allowed_for_site_function/,
      slug+': must return explicit deny response');
  });
}

test('private profile pilot authenticates and checks OAuth before looking up privileged profile',()=>{
  const source=read('orca-ai-profile-pilot');
  const checkerStart=source.indexOf('async function checkUser(req)');
  const verify=source.indexOf('.auth.getUser(',checkerStart);
  const guardAt=source.indexOf(guard,checkerStart);
  const profile=source.indexOf('.from("agent_profiles")',checkerStart);
  const handler=source.indexOf('Deno.serve(',checkerStart);
  assert.ok(checkerStart>=0 && verify>checkerStart && guardAt>verify &&
    profile>guardAt && handler>profile,'profile pilot guard order drifted');
  assert.equal(source.slice(checkerStart,guardAt).match(writes),null,
    'profile pilot called privilege-using mutation before OAuth guard');
  const firstAuthAction=source.slice(handler,handler+350);
  assert.match(firstAuthAction,/const owner=await checkUser\(req\)/);
  assert.match(firstAuthAction,/if\(!owner\)return send\(403/);
});

test('shared browser guard never trusts a supplied alias, email, origin, or client-side permission',()=>{
  const source=readFileSync(join(root,'supabase/functions/_shared/orca-browser-token.ts'),'utf8');
  assert.match(source,/claims.sub !== verifiedUserId/);
  assert.match(source,/claims.role !== 'authenticated'/);
  assert.match(source,/hasOwnProperty.call\(claims, 'client_id'\)/);
  assert.doesNotMatch(source,/user_metadata|display_name|alias|Origin\s*===|\.email\s*===/);
});
