import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {makeEncryptedPgOidcAdapter} from
  '../services/orca-owned-oauth/encrypted-pg-oidc-adapter.mjs';

const oldKey=randomBytes(32),newKey=randomBytes(32);
const grantId='consent-grant-opaque-1';
const oldKeyId='old-encryption-key-id',newKeyId='new-encryption-key-id';

function fakePg(){
  const data=new Map(),queries=[];
  const key=(model,ref)=>model+':'+Buffer.from(ref).toString('hex');
  async function query(sql,params) {
    queries.push({sql,params});
    assert.ok(sql.includes('orca_owned_oauth_private.provider_models'));
    if(sql.startsWith('insert into')){
      const [model,ref,grant,uid,keyId,iv,ciphertext,tag,ttl]=params;
      const k=key(model,ref),prior=data.get(k);
      if(prior?.consumed_at)return {rowCount:0,rows:[]};
      const row={
        model_type:model,model_id_hash:Buffer.from(ref),
        grant_id_hash:grant,uid_hash:uid,key_id:keyId,
        iv:Buffer.from(iv),ciphertext:Buffer.from(ciphertext),
        tag:Buffer.from(tag),consumed_at:null,
        expires_at:Date.now()+ttl*1000
      };
      data.set(k,row);
      return {rowCount:1,rows:[{model_id_hash:ref}]};
    }
    if(sql.startsWith('select')){
      const [model,ref]=params;
      let row;
      if(sql.includes('uid_hash=$2')){
        row=[...data.values()].find(r=>r.model_type===model&&r.uid_hash &&
          Buffer.from(r.uid_hash).equals(ref));
      }else row=data.get(key(model,ref));
      if(!row||row.expires_at<=Date.now())return {rowCount:0,rows:[]};
      return {rowCount:1,rows:[{...row}]};
    }
    if(sql.startsWith('update')){
      const [model,ref]=params,row=data.get(key(model,ref));
      if(!row||row.consumed_at||row.expires_at<=Date.now())
        return {rowCount:0,rows:[]};
      row.consumed_at=new Date().toISOString();
      return {rowCount:1,rows:[{model_id_hash:ref}]};
    }
    if(sql.startsWith('delete')){
      const [model,ref]=params;
      if(sql.includes('grant_id_hash=$2')){
        let count=0;
        for(const [k,row] of data.entries()){
          if(row.model_type===model &&
            ((row.grant_id_hash&&Buffer.from(row.grant_id_hash).equals(ref)) ||
             (model==='Grant'&&row.model_id_hash.equals(ref)))){
            data.delete(k);count++;
          }
        }
        return {rowCount:count,rows:[]};
      }
      const existed=data.delete(key(model,ref));
      return {rowCount:existed?1:0,rows:[]};
    }
    throw Error('unknown_test_query');
  }
  return {data,queries,query};
}
const factory=(db,keyId=oldKeyId,ring={[oldKeyId]:oldKey})=>
  makeEncryptedPgOidcAdapter({query:db.query,currentKeyId:keyId,keyring:ring});

test('Private provider models are AES-256-GCM encrypted and opaque IDs are hashed',async()=>{
  const db=fakePg(),Adapter=factory(db);
  const codes=new Adapter('AuthorizationCode');
  const payload={accountId:'test-existing-owner',clientId:'client-alpha',
    redirectUri:'https://trusted.example/cb',codeChallenge:'abc',
    grantId,secret:'SENSITIVE-NEVER-STORE-IN-PLAINTEXT'};
  await codes.upsert('opaque-auth-code-do-not-replay',payload,120);
  assert.equal(db.data.size,1);
  const row=[...db.data.values()][0];
  assert.equal(row.iv.length,12);assert.equal(row.tag.length,16);
  assert.equal(row.model_id_hash.length,32);
  assert.equal(row.key_id,oldKeyId);
  assert.equal(row.expires_at>Date.now(),true);
  assert.equal(JSON.stringify([...db.data.keys()]).includes('opaque-auth-code'),false);
  assert.equal(JSON.stringify(db.queries.map(q=>q.params.filter(x=>typeof x==='string'))).includes(
    'SENSITIVE-NEVER-STORE-IN-PLAINTEXT'),false);
  assert.equal(row.ciphertext.toString('utf8').includes('SENSITIVE-NEVER'),false);
  assert.deepEqual(await codes.find('opaque-auth-code-do-not-replay'),payload);
  assert.equal(await codes.find('a-different-authorization-code'),undefined);
});

test('Atomic code consume marks it on find and rejects a second consume or overwrite',async()=>{
  const db=fakePg(),Adapter=factory(db);
  const code=new Adapter('AuthorizationCode');
  await code.upsert('one-time-opaque-code',{grantId,kind:'AuthorizationCode'},60);
  assert.deepEqual(await code.find('one-time-opaque-code'),{
    grantId,kind:'AuthorizationCode'
  });
  await code.consume('one-time-opaque-code');
  const result=await code.find('one-time-opaque-code');
  assert.ok(result.consumed);
  await assert.rejects(code.consume('one-time-opaque-code'),/already_consumed_or_expired/);
  await assert.rejects(code.upsert('one-time-opaque-code',{grantId},60),
    /model_already_consumed/);
  const consumeSql=db.queries.find(q=>q.sql.startsWith('update')).sql;
  assert.match(consumeSql,/consumed_at is null/);
  assert.match(consumeSql,/expires_at>clock_timestamp/);
});

test('Session uid lookup uses only hashed UID and encrypted record',async()=>{
  const db=fakePg(),Adapter=factory(db);
  const session=new Adapter('Session');
  await session.upsert('long-session-model-id',{uid:'sensitive-session-uid',accountId:'owner'},
    300);
  assert.deepEqual(await session.findByUid('sensitive-session-uid'),
    {uid:'sensitive-session-uid',accountId:'owner'});
  assert.equal(await session.findByUid('different-uid'),undefined);
  assert.equal(db.queries.some(q=>JSON.stringify(q.params).includes('sensitive-session-uid')),false);
  await assert.rejects(new Adapter('Grant').findByUid('anything'),/only_for_sessions/);
  assert.throws(()=>new Adapter('UnexpectedModel'),/unsupported_oidc_model/);
});

test('Grant-specific revocation deletes related token entries in that model class',async()=>{
  const db=fakePg(),Adapter=factory(db);
  const code=new Adapter('AuthorizationCode'),session=new Adapter('Session');
  await code.upsert('code-A',{grantId},120);
  await code.upsert('code-B',{grantId:'different-grant'},120);
  await session.upsert('session-A',{uid:'session-uid',grantId},120);
  await code.revokeByGrantId(grantId);
  assert.equal(await code.find('code-A'),undefined);
  assert.ok(await code.find('code-B'));
  assert.ok(await session.find('session-A'),
    'A provider must revoke grant across all supported adapter model types');
  await session.revokeByGrantId(grantId);
  assert.equal(await session.find('session-A'),undefined);
  await code.destroy('code-B');
  assert.equal(await code.find('code-B'),undefined);
});

test('Changed ciphertext, wrong key and key rotation fail closed rather than silently accepting',async()=>{
  const db=fakePg(),Adapter=factory(db);
  const a=new Adapter('AuthorizationCode');
  await a.upsert('protected-code',{grantId},120);
  const row=[...db.data.values()][0];
  const WrongAdapter=factory(db,newKeyId,{[newKeyId]:newKey});
  await assert.rejects(new WrongAdapter('AuthorizationCode').find('protected-code'),
    /unknown_or_expired_key/);
  const RotatedAdapter=factory(db,newKeyId,{[oldKeyId]:oldKey,[newKeyId]:newKey});
  assert.deepEqual(await new RotatedAdapter('AuthorizationCode').find('protected-code'),
    {grantId});
  row.tag=Buffer.from(row.tag);row.tag[0]^=255;
  await assert.rejects(a.find('protected-code'));
  row.tag[0]^=255;
  await new RotatedAdapter('AuthorizationCode').upsert('new-code',{grantId},120);
  assert.equal([...db.data.values()].some(r=>r.key_id===newKeyId),true);
});

test('Missing encryption key, invalid TTL and disabled user code fail closed',async()=>{
  const db=fakePg();
  assert.throws(()=>makeEncryptedPgOidcAdapter({
    query:db.query,currentKeyId:'missing-key',keyring:{}
  }),/encryption_keys_required/);
  const Adapter=factory(db),code=new Adapter('AuthorizationCode');
  for(const ttl of [0,-1,null,32*24*60*60,1.25])
    await assert.rejects(code.upsert('foo',{key:'value'},ttl),/finite_model_ttl_required/);
  await assert.rejects(code.upsert('code-2',{payload:'x'.repeat(200_000)},60),
    /invalid_oidc_payload_size/);
  await assert.rejects(code.findByUserCode('user-code'),/device_flow_not_enabled/);
  await assert.rejects(code.find(''),/invalid_model_identifier/);
});

test('Postgres outage rejects find and consume; no fail-open cache exists',async()=>{
  const Adapter=makeEncryptedPgOidcAdapter({
    query:async()=>{throw Error('database-offline')},
    currentKeyId:oldKeyId,keyring:{[oldKeyId]:oldKey}
  });
  await assert.rejects(new Adapter('Session').find('session-id'),/database-offline/);
  await assert.rejects(new Adapter('AuthorizationCode').consume('code-id'),/database-offline/);
});
