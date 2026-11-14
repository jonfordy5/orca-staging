import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVerifiedOrcaBrowserToken } from '../supabase/functions/_shared/orca-browser-token.ts';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const existingWebsiteFunctions=[
  'orca-majority-synthesis','orca-timeline-discovery',
  'orca-timeline-photo-fill','orca-auto-ai-profile',
  'orca-ai-profile-pilot','orca-av-ulta-private-preview'
];
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function token(payload){
  return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'synthetic-signature-only-for-verified-token-check'].join('.');
}

test('existing verified browser token remains allowed',()=>{
  const browser=token({sub:owner,role:'authenticated',aud:'authenticated'});
  assert.equal(isVerifiedOrcaBrowserToken(browser,owner),true);
});

test('any linked OAuth client_id must be denied, including empty and null',()=>{
  for(const client_id of ['approved-client-alpha','another-client','',null,false,123]){
    const oauth=token({sub:owner,role:'authenticated',client_id});
    assert.equal(isVerifiedOrcaBrowserToken(oauth,owner),false);
  }
});

test('wrong owner, role or invalid token format is denied',()=>{
  assert.equal(isVerifiedOrcaBrowserToken(token({sub:owner,role:'authenticated'}),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),false);
  assert.equal(isVerifiedOrcaBrowserToken(token({sub:owner,role:'service_role'}),owner),false);
  for(const bad of ['',null,123,'header.bad.sig','only.two',
      token({role:'authenticated'}),token({sub:owner})]){
    assert.equal(isVerifiedOrcaBrowserToken(bad,owner),false);
  }
});

test('six privileged site functions gate the SAME token after Supabase verifies its identity',()=>{
  for(const slug of existingWebsiteFunctions){
    const code=readFileSync(join(root,'supabase/functions',slug,'index.ts'),'utf8');
    assert.match(code,/\.auth\.getUser\(/,slug+' must verify user with Supabase Auth');
    assert.match(code,/from ["']\.\.\/\_shared\/orca-browser-token\.ts["']/,slug+' missing guard import');
    assert.match(code,/isVerifiedOrcaBrowserToken\(/,slug+' must enforce OAuth client denial');
    const authPos=code.indexOf('.auth.getUser(');
    const checkPos=code.indexOf('isVerifiedOrcaBrowserToken(',authPos);
    assert.ok(checkPos>authPos,slug+' must call guard after Auth.getUser');
    assert.ok(code.includes('oauth_client_not_allowed_for_site_function') || 
      /if\(!isVerifiedOrcaBrowserToken\([^)]*\)\)return null;/.test(code),
      slug+' must reject linked agents before privileged activity');
  }
});

test('OAuth MCP read-only endpoint is intentionally separate from these browser-only guards',()=>{
  assert.equal(existingWebsiteFunctions.includes('orca-agent-readonly'),false);
  assert.equal(existingWebsiteFunctions.includes('orca-agent-mcp'),false);
});
