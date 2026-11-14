import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeReadOnlyMcpClaims, ORCA_MCP_STAGING_ISSUER, ORCA_MCP_STAGING_RESOURCE
} from '../supabase/functions/orca-agent-mcp/token-policy.mjs';

// Synthetic claims only. Supabase middleware and auth.getClaims/getUser perform
// actual JWT validation in the runtime; this suite validates resource/client
// policy decisions and NEVER mints a usable OAuth credential.
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const client='orca-staging-test-client';
const approved=new Set([client]);
const valid=()=>({
  iss:ORCA_MCP_STAGING_ISSUER,
  aud:['authenticated',ORCA_MCP_STAGING_RESOURCE],
  client_id:client,
  sub:owner,
  role:'authenticated'
});
const check=(claims,ids=approved,id=owner)=>
  authorizeReadOnlyMcpClaims(claims,ids,id);
const deny=(claims,reason,ids=approved,id=owner)=>
  assert.deepEqual(check(claims,ids,id),{ok:false,reason});

test('upstream RFC 8707 Supabase audience array is accepted only for approved client',()=>{
  assert.deepEqual(check(valid()),{ok:true});
});
test('single resource audience from independently reviewed token hook also accepted',()=>{
  assert.deepEqual(check({...valid(),aud:ORCA_MCP_STAGING_RESOURCE}),{ok:true});
});
test('ordinary ORCA signed-in browser token is not a connected OAuth client',()=>{
  const {client_id,...browser}=valid();
  deny({...browser,aud:'authenticated'},'wrong_resource_audience');
  deny({...browser,aud:ORCA_MCP_STAGING_RESOURCE},'invalid_oauth_client');
});
test('issuer and exact resource must match, not generic authenticated or lookalike',()=>{
  for(const iss of [undefined,'https://another.example/auth/v1',
    ORCA_MCP_STAGING_ISSUER+'/','http://vbziibatnejoswsdggga.supabase.co/auth/v1']){
    deny({...valid(),iss},'invalid_issuer');
  }
  for(const aud of [undefined,null,{},[],['authenticated'],'authenticated',
    ORCA_MCP_STAGING_RESOURCE+'-evil',
    [ORCA_MCP_STAGING_RESOURCE+'?foo=1'],['authenticated','https://example.test/mcp']]){
    deny({...valid(),aud},'wrong_resource_audience');
  }
});
test('malformed claims fail closed',()=>{
  for(const claims of [null,undefined,false,4,'abc',[],['authenticated']]){
    deny(claims,'invalid_claims');
  }
});
test('unknown, disabled, and empty allowlists never grant account access',()=>{
  deny(valid(),'unapproved_client',new Set());
  deny({...valid(),client_id:'another-valid-client'},'unapproved_client');
  deny(valid(),'unapproved_client',null);
  deny(valid(),'unapproved_client',new Set(['another-valid-client']));
});
test('client IDs may be metadata-document HTTPS URLs but must exactly match allowlist',()=>{
  const url='https://chatgpt.com/oauth/clients/orca-prototype.json';
  const claims={...valid(),client_id:url};
  assert.deepEqual(check(claims,new Set([url])),{ok:true});
  deny({...claims,client_id:url+'-evil'},'unapproved_client',new Set([url]));
});
test('blank, invalid or whitespace client IDs denied before allowlist',()=>{
  for(const client_id of [undefined,null,'',false,42,' a',' a valid-client',
     'short','has\nnewline','contains\tTAB', 'x'.repeat(257)]){
    deny({...valid(),client_id},'invalid_oauth_client',new Set([client_id]));
  }
});
test('owner mismatch cannot read another ORCA researcher',()=>{
  const userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  deny(valid(),'identity_mismatch',approved,userB);
  deny({...valid(),sub:userB},'identity_mismatch');
  deny({...valid(),sub:null},'identity_mismatch');
  deny(valid(),'identity_mismatch',approved,null);
});
