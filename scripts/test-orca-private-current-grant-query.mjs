import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedGrantRegistry,CURRENT_GRANT_SELECT} from
  '../services/orca-owned-oauth/grant-registry.mjs';
import {createVerifiedCurrentGrantQuery} from
  '../services/orca-owned-oauth/verified-current-grant-query.mjs';

const grantA='11111111-2222-4333-8444-555555555555';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='https://registered.example/client.json';
const resource='https://mcp.orca.example/mcp';

function fixture({role='orca_owned_mcp_grant_reader'}={}){
  const calls=[];
  let connectCount=0,released=0,revoked=false,broken=false;
  const pool={
    async connect(){
      connectCount++;
      let inTransaction=false;
      const context={};
      return {
        async query(sql,params=[]){
          calls.push({sql,params:[...params]});
          if(sql==='BEGIN TRANSACTION READ ONLY'){
            inTransaction=true;return {rows:[],rowCount:null};
          }
          if(sql==='SELECT current_user AS role')
            return {rows:[{role}],rowCount:1};
          if(sql==="SELECT set_config($1::text,$2::text,true)"){
            if(!inTransaction)throw Error('outside_read_only_transaction');
            context[params[0]]=params[1];
            return {rows:[{set_config:params[1]}],rowCount:1};
          }
          if(sql===CURRENT_GRANT_SELECT){
            if(broken)throw Error('private_postgres_down');
            const [grantId,ownerId,clientId,audience,scope]=params;
            const matched=!revoked&&inTransaction&&
              context['orca.verified_grant_id']===grantId&&
              context['orca.verified_owner_id']===ownerId&&
              context['orca.verified_client_id']===clientId&&
              context['orca.verified_resource']===audience&&
              grantId===grantA&&ownerId===ownerA&&clientId===clientA&&
              audience===resource&&scope==='orca:research.read';
            return matched?
              {rows:[{active:1}],rowCount:1}:{rows:[],rowCount:0};
          }
          if(sql==='COMMIT'||sql==='ROLLBACK'){
            inTransaction=false;
            for(const k of Object.keys(context))delete context[k];
            return {rows:[],rowCount:null};
          }
          throw Error('unapproved_query');
        },
        release(){released++;}
      };
    }
  };
  const query=createVerifiedCurrentGrantQuery({pool,resource});
  const registry=createOwnedGrantRegistry({query,resource});
  const check=(patch={})=>registry.isCurrentGrant({
    grantId:grantA,ownerId:ownerA,clientId:clientA,resource,
    scope:'orca:research.read',...patch
  });
  return {query,registry,check,calls,
    connectCount:()=>connectCount,released:()=>released,
    revoke:()=>revoked=true,breakDatabase:()=>broken=true};
}
test('exact grant lookup is bounded by read-only role and FOUR transaction-local identities',async()=>{
  const f=fixture();
  assert.equal(await f.check(),true);
  assert.deepEqual(f.calls.map(x=>x.sql),[
    'BEGIN TRANSACTION READ ONLY',
    'SELECT current_user AS role',
    "SELECT set_config($1::text,$2::text,true)",
    "SELECT set_config($1::text,$2::text,true)",
    "SELECT set_config($1::text,$2::text,true)",
    "SELECT set_config($1::text,$2::text,true)",
    CURRENT_GRANT_SELECT,
    'COMMIT'
  ]);
  assert.deepEqual(f.calls.filter(x=>x.sql.startsWith('SELECT set_config'))
    .map(x=>x.params[0]),[
      'orca.verified_owner_id','orca.verified_grant_id',
      'orca.verified_client_id','orca.verified_resource'
    ]);
  assert.equal(f.released(),1);
});
test('two owner accounts cannot exchange grants, then revoke denies before any cached result',async()=>{
  const f=fixture();
  assert.equal(await f.check(),true);
  assert.equal(await f.check({ownerId:ownerB}),false);
  assert.equal(await f.check({clientId:'https://other.example/client'}),false);
  f.revoke();
  assert.equal(await f.check(),false);
  assert.equal(f.connectCount(),4);
  assert.equal(f.released(),4);
});
test('arbitrary private SQL, malformed owner, invalid scope or other resource never reaches DB',async()=>{
  const f=fixture();
  const invalid=[
    ['delete from orca_owned_oauth_private.grants',[]],
    [CURRENT_GRANT_SELECT,[grantA,ownerA,clientA,resource,'orca:research.write']],
    [CURRENT_GRANT_SELECT,[grantA,ownerA,clientA,'https://evil.example/mcp','orca:research.read']],
    [CURRENT_GRANT_SELECT,[grantA,'not-uuid',clientA,resource,'orca:research.read']],
    [CURRENT_GRANT_SELECT,[grantA,ownerA,'\ninvalid',resource,'orca:research.read']]
  ];
  for(const [sql,values] of invalid)
    await assert.rejects(f.query(sql,values),
      /private_current_grant_lookup_unavailable/);
  assert.equal(f.connectCount(),0);
});
test('wrong SQL role is denied before a single private grant SELECT; session rolled back',async()=>{
  for(const role of ['postgres','service_role','authenticated','orca_owned_issuer_writer']){
    const f=fixture({role});
    await assert.rejects(f.check(),/private_current_grant_lookup_unavailable/);
    assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
    assert.ok(!f.calls.some(x=>x.sql===CURRENT_GRANT_SELECT));
    assert.equal(f.released(),1);
  }
});
test('database error never permits a grant; rollback and connection release are mandatory',async()=>{
  const f=fixture();f.breakDatabase();
  await assert.rejects(f.check(),/private_current_grant_lookup_unavailable/);
  assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
  assert.equal(f.released(),1);
});
