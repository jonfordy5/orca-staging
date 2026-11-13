import test from 'node:test';
import assert from 'node:assert/strict';
import {createIssuerPrivateQuery} from
  '../services/orca-owned-oauth/issuer-private-query.mjs';

const SQL='select id from orca_owned_oauth_private.grants where id=$1';
const values=['11111111-2222-4333-8444-555555555555'];
function fixture({fail=false,wrongResult=false}={}){
  const calls=[];let opens=0,closes=0;
  const connector={
    async connect(){
      opens++;let inTransaction=false;
      return {
        async query(statement,params=[]){
          calls.push({statement,params});
          if(statement==='BEGIN'){inTransaction=true;return {rows:[],rowCount:null};}
          if(statement==='COMMIT'){inTransaction=false;return {rows:[],rowCount:null};}
          if(statement==='ROLLBACK'){inTransaction=false;return {rows:[],rowCount:null};}
          if(!inTransaction)throw Error('query_without_transaction');
          if(fail)throw Error('PG_PASSWORD_MUST_NOT_BE_LOGGED');
          if(wrongResult)return {rows:null,rowCount:1};
          return {rows:[{id:values[0]}],rowCount:1};
        },
        release(){closes++;}
      };
    }
  };
  return {query:createIssuerPrivateQuery({connector}),
    calls,opens:()=>opens,closes:()=>closes};
}
test('issuer's fixed internal SQL runs only inside fresh transaction',async()=>{
  const f=fixture();
  const a=await f.query(SQL,values);
  const b=await f.query(SQL,values);
  assert.deepEqual(a,b);
  assert.equal(f.opens(),2);
  assert.equal(f.closes(),2);
  assert.deepEqual(f.calls.map(x=>x.statement),[
    'BEGIN',SQL,'COMMIT','BEGIN',SQL,'COMMIT'
  ]);
  assert.deepEqual(f.calls[1].params,values);
});
test('never accepts public SQL, multiple statements or arbitrary privilege changes',async()=>{
  const f=fixture();
  for(const [sql,args] of [
    ['drop table orca_owned_oauth_private.grants',[]],
    ['select * from public.agent_profiles',[]],
    ['set role postgres',[]],
    ['select 1; delete from orca_owned_oauth_private.grants',[]],
    ['select * from orca_owned_oauth_private.grants where id=$1;',values],
    ['select 1',[]],
    [SQL,new Array(21).fill('input')]
  ]){
    await assert.rejects(f.query(sql,args),
      /orca_issuer_private_database_unavailable/);
  }
  assert.equal(f.opens(),0);
});
test('database failure rolls back, closes session and does not print sensitive message',async()=>{
  const f=fixture({fail:true});
  await assert.rejects(f.query(SQL,values),err=>{
    assert.equal(err.message,'orca_issuer_private_database_unavailable');
    assert.ok(!err.message.includes('PG_PASSWORD'));
    return true;
  });
  assert.deepEqual(f.calls.map(x=>x.statement),['BEGIN',SQL,'ROLLBACK']);
  assert.equal(f.closes(),1);
});
test('unexpected database result is also denied with rollback',async()=>{
  const f=fixture({wrongResult:true});
  await assert.rejects(f.query(SQL,values),
    /orca_issuer_private_database_unavailable/);
  assert.equal(f.closes(),1);
  assert.equal(f.calls.at(-1).statement,'ROLLBACK');
});
