import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedOwnerReadQuery} from
  '../services/orca-owned-oauth/verified-owner-read-query.mjs';
import {RESEARCH_READ_SQL} from
  '../services/orca-owned-oauth/read-only-research-dispatcher.mjs';

const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
function fixture({role='orca_owned_mcp_reader',failSelect=false}={}){
  const history=[];
  let released=0;
  const pool={
    async connect(){
      let begun=false,localOwner=null;
      return {
        async query(sql,params=[]){
          history.push({sql,params,localOwner});
          if(sql==='BEGIN TRANSACTION READ ONLY'){begun=true;return {rows:[]};}
          if(sql==='SELECT current_user AS role')
            return {rows:[{role}]};
          if(sql.startsWith('SELECT set_config(')){
            if(!begun)throw Error('outside_transaction');
            localOwner=params[0];
            return {rows:[{set_config:localOwner}]};
          }
          if(sql==='COMMIT'){begun=false;localOwner=null;return {rows:[]};}
          if(sql==='ROLLBACK'){begun=false;localOwner=null;return {rows:[]};}
          if(!begun||!localOwner)throw Error('missing_verified_owner_context');
          if(failSelect)throw Error('mock_database_failure');
          if(sql===RESEARCH_READ_SQL.PROFILE_SQL)
            return {rows:[{display_name:localOwner===ownerA?'A':'B',opted_in:true}]};
          if(sql===RESEARCH_READ_SQL.MEMBERSHIP_SQL)
            return {rows:params[1]==='RKLB'?[{joined:1}]:[]};
          if(sql===RESEARCH_READ_SQL.ASSIGNMENT_SQL)
            return {rows:[]};
          throw Error('unknown_query');
        },
        release(){released++;}
      };
    }
  };
  return {query:createVerifiedOwnerReadQuery({pool}),history,
    released:()=>released};
}
test('only fixed owner-parameterized SELECT statements can execute',async()=>{
  const f=fixture();
  await assert.rejects(f.query(
    'delete from public.research_tasks where claimed_owner_id=$1',[ownerA]));
  await assert.rejects(f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerA,ownerB]));
  await assert.rejects(f.query(RESEARCH_READ_SQL.MEMBERSHIP_SQL,[ownerA,'RKLB;drop']));
  await assert.rejects(f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerB.slice(0,30)]));
  assert.equal(f.history.length,0,'Invalid inputs never touch PostgreSQL');
});

test('each read uses a role-checked read-only transaction with a local verified owner',async()=>{
  const f=fixture();
  const first=await f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerA]);
  const second=await f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerB]);
  assert.deepEqual(first.rows,[{display_name:'A',opted_in:true}]);
  assert.deepEqual(second.rows,[{display_name:'B',opted_in:true}]);
  assert.equal(f.released(),2);
  assert.deepEqual(f.history.map(x=>x.sql),[
    'BEGIN TRANSACTION READ ONLY',
    'SELECT current_user AS role',
    "SELECT set_config('orca.verified_owner_id', $1::text, true)",
    RESEARCH_READ_SQL.PROFILE_SQL,
    'COMMIT',
    'BEGIN TRANSACTION READ ONLY',
    'SELECT current_user AS role',
    "SELECT set_config('orca.verified_owner_id', $1::text, true)",
    RESEARCH_READ_SQL.PROFILE_SQL,
    'COMMIT'
  ]);
  assert.deepEqual(f.history.filter(x=>x.sql.startsWith('SELECT set_config'))
    .map(x=>x.params[0]),[ownerA,ownerB]);
});

test('wrong database role is refused before reading any owner information',async()=>{
  for(const role of ['postgres','service_role','authenticated','authenticator']){
    const f=fixture({role});
    await assert.rejects(f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerA]),
      /read_only_research_database_unavailable/);
    assert.ok(!f.history.some(x=>x.sql===RESEARCH_READ_SQL.PROFILE_SQL));
    assert.ok(f.history.some(x=>x.sql==='ROLLBACK'));
    assert.equal(f.released(),1);
  }
});

test('database failure rolls back and releases session, never returning cached data',async()=>{
  const f=fixture({failSelect:true});
  await assert.rejects(f.query(RESEARCH_READ_SQL.PROFILE_SQL,[ownerA]),
    /read_only_research_database_unavailable/);
  assert.equal(f.released(),1);
  assert.equal(f.history.at(-1).sql,'ROLLBACK');
});

test('assignment query permits only exact authenticated owner and optional safe ticker',async()=>{
  const f=fixture();
  assert.deepEqual((await f.query(RESEARCH_READ_SQL.ASSIGNMENT_SQL,
    [ownerA,null])).rows,[]);
  assert.deepEqual((await f.query(RESEARCH_READ_SQL.ASSIGNMENT_SQL,
    [ownerB,'RKLB'])).rows,[]);
  assert.deepEqual((await f.query(RESEARCH_READ_SQL.MEMBERSHIP_SQL,
    [ownerA,'RKLB'])).rows,[{joined:1}]);
  assert.equal(f.released(),3);
});
