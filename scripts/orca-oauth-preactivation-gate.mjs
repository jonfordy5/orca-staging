// ORCA preactivation DB surface drift gate.
// This assesses a fresh, operator-supplied SQL inventory, not an OAuth token.
// Passing means "no unexpected changes to reviewed staging DB protections";
// it NEVER means a ChatGPT connection is safe to activate or deployed.
const expectedRpcDigest='9ed518cf551c2471e134d8155ff9ddeb';
const expectedPublicWrites=Object.freeze({
  agent_profiles:{can_insert:false,can_update:false,can_delete:true},
  stock_research_memberships:{can_insert:true,can_update:false,can_delete:true}
});
const expectedOtherWrites=new Set([
  'realtime.messages','storage.buckets','storage.buckets_analytics','storage.objects'
]);
const expectedPolicies=Object.freeze({
  'ORCA OAuth cannot delete profiles':['agent_profiles','DELETE'],
  'ORCA OAuth cannot insert profiles':['agent_profiles','INSERT'],
  'ORCA OAuth cannot update profiles':['agent_profiles','UPDATE'],
  'ORCA OAuth cannot join teams':['stock_research_memberships','INSERT'],
  'ORCA OAuth cannot leave teams':['stock_research_memberships','DELETE'],
  'ORCA OAuth cannot update teams':['stock_research_memberships','UPDATE'],
  'ORCA OAuth may view only own memberships':['stock_research_memberships','SELECT']
});
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sort=x=>[...x].sort();
const equalSorted=(a,b)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
const deniesOAuth=(value)=>typeof value==='string' &&
  value.includes('client_id') && value.includes('IS NULL');
const positiveOwnerRule=value=>typeof value==='string' &&
  value.includes('client_id') && value.includes('IS NULL') &&
  value.includes('user_id') && value.includes('auth.uid()');

export function assessOrcaStagingDbSurface(snapshot) {
  const blockers=[];
  const require=(condition,message)=>{if(!condition)blockers.push(message)};
  if(!record(snapshot))return {passed:false,blockers:['missing_or_invalid_database_inventory']};

  require(snapshot.project_ref==='vbziibatnejoswsdggga','wrong_staging_project');
  require(snapshot.postgrest_guard_configured===true,'postgrest_guard_not_active');
  require(snapshot.approved_clients===0,'client_registry_not_empty_before_activation');
  require(snapshot.rpc_count===19&&snapshot.rpc_definers===14&&snapshot.rpc_digest===expectedRpcDigest,
    'public_rpc_surface_changed_review_required');
  require(snapshot.pg_graphql_installed===false&&snapshot.graphql_executable===0,
    'graphql_surface_requires_isolation_review');

  if(!Array.isArray(snapshot.public_writable)) {
    blockers.push('public_write_inventory_missing');
  } else {
    const listed=snapshot.public_writable.map(x=>x?.name);
    require(equalSorted(listed,Object.keys(expectedPublicWrites)),
      'public_writable_tables_changed_review_required');
    for(const item of snapshot.public_writable){
      if(!record(item)||!Object.hasOwn(expectedPublicWrites,item.name))continue;
      require(item.rls===true,'public_rls_disabled:'+item.name);
      const expected=expectedPublicWrites[item.name];
      for(const operation of ['can_insert','can_update','can_delete']){
        require(item[operation]===expected[operation],
          'public_grants_changed:'+item.name+':'+operation);
      }
    }
  }

  if(!Array.isArray(snapshot.other_writable)){
    blockers.push('storage_realtime_inventory_missing');
  } else {
    const listed=snapshot.other_writable.map(x=>String(x?.schema_name||'')+'.'+String(x?.name||''));
    require(equalSorted(listed,expectedOtherWrites),'storage_realtime_surface_changed_review_required');
    for(const item of snapshot.other_writable){
      const name=String(item?.schema_name||'')+'.'+String(item?.name||'');
      require(item?.rls===true,'storage_realtime_rls_not_enabled:'+name);
      require(item?.permissive_policies===0,'storage_realtime_policy_requires_review:'+name);
    }
  }

  if(!Array.isArray(snapshot.oauth_policies)){
    blockers.push('oauth_policy_inventory_missing');
  } else {
    const listed=snapshot.oauth_policies.map(x=>x?.name);
    require(equalSorted(listed,Object.keys(expectedPolicies)),
      'oauth_policy_list_changed_review_required');
    for(const item of snapshot.oauth_policies) {
      if(!record(item)||!Object.hasOwn(expectedPolicies,item.name))continue;
      const [expectedTable,expectedCommand]=expectedPolicies[item.name];
      require(item.table_name===expectedTable&&item.cmd===expectedCommand,
        'oauth_policy_wrong_target:'+item.name);
      require(item.permissive==='RESTRICTIVE'&&item.roles==='{authenticated}',
        'oauth_policy_not_restrictive:'+item.name);
      if(item.cmd==='SELECT'){
        require(positiveOwnerRule(item.using_clause),'oauth_membership_owner_rule_missing');
      } else {
        if(['DELETE','UPDATE'].includes(item.cmd))require(deniesOAuth(item.using_clause),
          'oauth_using_denial_missing:'+item.name);
        if(['INSERT','UPDATE'].includes(item.cmd))require(deniesOAuth(item.check_clause),
          'oauth_with_check_denial_missing:'+item.name);
      }
    }
  }

  return {passed:blockers.length===0,blockers};
}
