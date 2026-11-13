import test from 'node:test';
import assert from 'node:assert/strict';
import {assessOrcaStagingDbSurface} from './orca-oauth-preactivation-gate.mjs';

const good=()=>{
  const policy=(name,table_name,cmd,using_clause='',check_clause='')=>({
    name,table_name,cmd,permissive:'RESTRICTIVE',roles:'{authenticated}',
    using_clause,check_clause
  });
  const deny="((auth.jwt() ->> 'client_id'::text) IS NULL)";
  return {
    project_ref:'vbziibatnejoswsdggga',
    postgrest_guard_configured:true,
    approved_clients:0,
    rpc_count:19,
    rpc_definers:14,
    rpc_digest:'9ed518cf551c2471e134d8155ff9ddeb',
    pg_graphql_installed:false,
    graphql_executable:0,
    public_writable:[
      {name:'agent_profiles',rls:true,can_insert:false,can_update:false,can_delete:true},
      {name:'stock_research_memberships',rls:true,can_insert:true,can_update:false,can_delete:true}
    ],
    other_writable:[
      {schema_name:'realtime',name:'messages',rls:true,permissive_policies:0},
      {schema_name:'storage',name:'buckets',rls:true,permissive_policies:0},
      {schema_name:'storage',name:'buckets_analytics',rls:true,permissive_policies:0},
      {schema_name:'storage',name:'objects',rls:true,permissive_policies:0}
    ],
    oauth_policies:[
      policy('ORCA OAuth cannot delete profiles','agent_profiles','DELETE',deny),
      policy('ORCA OAuth cannot insert profiles','agent_profiles','INSERT','',deny),
      policy('ORCA OAuth cannot update profiles','agent_profiles','UPDATE',deny,deny),
      policy('ORCA OAuth cannot join teams','stock_research_memberships','INSERT','',deny),
      policy('ORCA OAuth cannot leave teams','stock_research_memberships','DELETE',deny),
      policy('ORCA OAuth cannot update teams','stock_research_memberships','UPDATE',deny,deny),
      policy('ORCA OAuth may view only own memberships','stock_research_memberships','SELECT',
        "(((auth.jwt() ->> 'client_id'::text) IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))")
    ]
  };
};

test('Reviewed DB protection shape passes PREACTIVATION ONLY and cannot prove live OAuth',()=>{
  const result=assessOrcaStagingDbSurface(good());
  assert.deepEqual(result,{passed:true,blockers:[]});
});

test('Missing inventory, wrong project, missing PostgREST hook, client approval and RPC drift all block',()=>{
  for(const [mutate,expected] of [
    [x=>x.project_ref='wrong','wrong_staging_project'],
    [x=>x.postgrest_guard_configured=false,'postgrest_guard_not_active'],
    [x=>x.approved_clients=1,'client_registry_not_empty_before_activation'],
    [x=>x.rpc_count=20,'public_rpc_surface_changed_review_required'],
    [x=>x.rpc_digest='0'.repeat(32),'public_rpc_surface_changed_review_required'],
    [x=>x.pg_graphql_installed=true,'graphql_surface_requires_isolation_review'],
    [x=>x.graphql_executable=1,'graphql_surface_requires_isolation_review']
  ]){
    const x=good();mutate(x);
    assert.ok(assessOrcaStagingDbSurface(x).blockers.includes(expected),expected);
  }
  assert.equal(assessOrcaStagingDbSurface(null).passed,false);
});

test('New public write surface, relaxed role permission and missing RLS block',()=>{
  for(const mutate of [
    x=>x.public_writable.push({name:'unsafe_new_table',rls:false,can_insert:true}),
    x=>x.public_writable[0].rls=false,
    x=>x.public_writable[1].can_update=true,
    x=>x.public_writable=[]
  ]){
    const x=good();mutate(x);assert.equal(assessOrcaStagingDbSurface(x).passed,false);
  }
});

test('New Storage/Realtime policy or writable object blocks pending independent review',()=>{
  for(const mutate of [
    x=>x.other_writable[0].permissive_policies=1,
    x=>x.other_writable[1].rls=false,
    x=>x.other_writable.push({schema_name:'storage',name:'new_objects',rls:true,permissive_policies:0}),
    x=>x.other_writable=[]
  ]){
    const x=good();mutate(x);assert.equal(assessOrcaStagingDbSurface(x).passed,false);
  }
});

test('OAuth policy removal, permissive replacement, wrong role and missing predicates block',()=>{
  for(const mutate of [
    x=>x.oauth_policies.pop(),
    x=>x.oauth_policies[0].permissive='PERMISSIVE',
    x=>x.oauth_policies[1].roles='{anon}',
    x=>x.oauth_policies[1].check_clause='true',
    x=>x.oauth_policies[2].using_clause='true',
    x=>x.oauth_policies[2].check_clause='true',
    x=>x.oauth_policies[6].using_clause='true',
    x=>x.oauth_policies[6].using_clause="((auth.jwt() ->> 'client_id') IS NULL)"
  ]){
    const x=good();mutate(x);assert.equal(assessOrcaStagingDbSurface(x).passed,false);
  }
});
