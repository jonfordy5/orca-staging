import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateConsentChallenges} from
  '../services/orca-owned-oauth/consent-challenge.mjs';

const resource='https://staging.example.invalid/orca-mcp';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='https://agent.example.invalid/.well-known/oauth-client.json';
const clientB='https://different-agent.example.invalid/client.json';
const interactionA='interaction-A-opaque-session-0001';
const sessionA='browser-session-A-opaque-0001';

function fakeDatabase(){
  const records=new Map(),calls=[];
  const equal=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
  const query=async(sql,params)=>{
    calls.push({sql,params});
    assert.ok(sql.includes('orca_owned_oauth_private.consent_challenges'));
    if(sql.startsWith('insert into')){
      const [id,owner_id,client_id,resource,interaction_hash,
        session_hash,csrf_hash,ttlSeconds]=params;
      const row={id,owner_id,client_id,resource,interaction_hash,
        session_hash,csrf_hash,consumed_at:null,expires_at:Date.now()+ttlSeconds*1000};
      records.set(id,row);
      return {rowCount:1,rows:[{id}]};
    }
    if(sql.startsWith('update')){
      const [id,owner,client,audience,interaction,session,csrf]=params;
      const row=records.get(id);
      if(!row||row.consumed_at||row.expires_at<=Date.now()||
        row.owner_id!==owner||row.client_id!==client||row.resource!==audience||
        !equal(row.interaction_hash,interaction)||!equal(row.session_hash,session)||
        !equal(row.csrf_hash,csrf))return {rowCount:0,rows:[]};
      row.consumed_at=new Date().toISOString();
      return {rowCount:1,rows:[{id}]};
    }
    throw Error('unexpected_database_statement');
  };
  return {query,records,calls};
}

test('One-time consent challenge keeps browser, interaction, and CSRF secrets out of database',async()=>{
  const db=fakeDatabase(),store=createPrivateConsentChallenges({query:db.query,resource});
  const {challengeId,csrfToken}=await store.prepare({
    ownerId:ownerA,clientId:clientA,interactionUid:interactionA,
    browserSessionId:sessionA
  });
  assert.match(csrfToken,/^[A-Za-z0-9_-]{43}$/);
  assert.match(challengeId,/^[a-f0-9-]{36}$/i);
  const row=db.records.get(challengeId);
  assert.equal(row.client_id,clientA);
  assert.equal(row.interaction_hash.length,32);
  assert.equal(row.session_hash.length,32);
  assert.equal(row.csrf_hash.length,32);
  assert.ok(!db.calls.some(c=>c.params.includes(csrfToken)));
  assert.ok(!db.calls.some(c=>c.params.includes(interactionA)));
  assert.ok(!db.calls.some(c=>c.params.includes(sessionA)));
  assert.equal(await store.consume({
    challengeId,csrfToken,ownerId:ownerA,clientId:clientA,
    interactionUid:interactionA,browserSessionId:sessionA
  }),true);
  assert.equal(await store.consume({
    challengeId,csrfToken,ownerId:ownerA,clientId:clientA,
    interactionUid:interactionA,browserSessionId:sessionA
  }),false,'A consumed CSRF token may never authorize another grant');
  assert.equal(db.calls.at(-1).sql.includes('consumed_at is null'),true);
  assert.equal(db.calls.at(-1).sql.includes('expires_at>clock_timestamp()'),true);
});

test('Two owners cannot swap their CSRF challenge, client, interaction or browser session',async()=>{
  const db=fakeDatabase(),store=createPrivateConsentChallenges({query:db.query,resource});
  const first={ownerId:ownerA,clientId:clientA,
    interactionUid:interactionA,browserSessionId:sessionA};
  const saved=await store.prepare(first);
  const base={...first,...saved};
  for(const swapped of [
    {ownerId:ownerB},{clientId:clientB},
    {interactionUid:'other-interaction-opaque-id-2'},
    {browserSessionId:'other-session-opaque-id-0002'},
    {csrfToken:'A'.repeat(43)}
  ])assert.equal(await store.consume({...base,...swapped}),false);
  assert.equal(await store.consume(base),true);
});

test('Expired challenge, short token, invalid TTL and database outage all fail closed',async()=>{
  const db=fakeDatabase(),store=createPrivateConsentChallenges({query:db.query,resource});
  const args={ownerId:ownerA,clientId:clientA,
    interactionUid:interactionA,browserSessionId:sessionA};
  for(const ttlSeconds of [0,1,301,2.5]){
    await assert.rejects(store.prepare({...args,ttlSeconds}),/invalid_consent_ttl/);
  }
  await assert.rejects(store.prepare({...args,ownerId:'fake-user'}),/invalid_verified_owner/);
  const saved=await store.prepare(args);
  await assert.rejects(store.consume({...args,...saved,csrfToken:'short'}),/invalid_csrf/);
  db.records.get(saved.challengeId).expires_at=Date.now()-100;
  assert.equal(await store.consume({...args,...saved}),false);
  const down=createPrivateConsentChallenges({
    query:async()=>{throw Error('private_database_unavailable')},resource
  });
  await assert.rejects(down.prepare(args),/private_database_unavailable/);
  await assert.rejects(down.consume({...args,...saved}),/private_database_unavailable/);
  assert.throws(()=>createPrivateConsentChallenges({
    query:db.query,resource:'http://localhost:3000'
  }),/private_consent_store_required/);
});
