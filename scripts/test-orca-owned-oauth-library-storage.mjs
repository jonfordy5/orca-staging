import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {
  buildLocalPreviewProvider,PREVIEW_CLIENT_ID,PREVIEW_RESOURCE
} from '../services/orca-owned-oauth/dev-preview.mjs';
import {
  makeEncryptedPgOidcAdapter
} from '../services/orca-owned-oauth/encrypted-pg-oidc-adapter.mjs';

// Simulated PRIVATE SQL store, not a user-visible database and not Supabase.
// Verifies the installed oidc-provider calls OUR adapter as documented.
function privateSqlFixture(){
  const models=new Map(),calls=[];
  const id=(type,ref)=>type+':'+Buffer.from(ref).toString('hex');
  const query=async(sql,p)=>{
    calls.push(sql.split(' ')[0]);
    if(sql.startsWith('insert into')){
      const [type,ref,grant,uid,keyId,iv,ciphertext,tag,ttl]=p;
      const record={
        model_id_hash:Buffer.from(ref),grant_id_hash:grant,uid_hash:uid,
        key_id:keyId,iv:Buffer.from(iv),ciphertext:Buffer.from(ciphertext),
        tag:Buffer.from(tag),consumed_at:null,expires_at:Date.now()+ttl*1000
      };
      models.set(id(type,ref),record);
      return {rowCount:1,rows:[{model_id_hash:ref}]};
    }
    if(sql.startsWith('select')){
      const [type,ref]=p;
      const record=models.get(id(type,ref));
      return record&&record.expires_at>Date.now()
        ?{rowCount:1,rows:[record]}:{rowCount:0,rows:[]};
    }
    if(sql.startsWith('delete')){
      const [type,ref]=p;
      const removed=models.delete(id(type,ref));
      return {rowCount:removed?1:0,rows:[]};
    }
    if(sql.startsWith('update')){
      const [type,ref]=p,record=models.get(id(type,ref));
      if(!record||record.consumed_at)return {rowCount:0,rows:[]};
      record.consumed_at=new Date().toISOString();
      return {rowCount:1,rows:[{model_id_hash:ref}]};
    }
    throw Error('Unexpected provider SQL operation');
  };
  return {query,models,calls};
}

test('Actual oidc-provider persists and reloads an encrypted, owner-bound Grant model',async()=>{
  const db=privateSqlFixture();
  const secretKey=randomBytes(32);
  const Adapter=makeEncryptedPgOidcAdapter({
    query:db.query,currentKeyId:'oidc-test-key-01',
    keyring:{'oidc-test-key-01':secretKey}
  });
  const provider=buildLocalPreviewProvider({adapter:Adapter});
  const ownerId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const grant=new provider.Grant({accountId:ownerId,clientId:PREVIEW_CLIENT_ID});
  grant.addOIDCScope('openid');
  grant.addResourceScope(PREVIEW_RESOURCE,'orca:research.read');
  const id=await grant.save();
  assert.equal(typeof id,'string');
  assert.ok(id.length>10);
  const stored=await provider.Grant.find(id);
  assert.ok(stored);
  assert.equal(stored.accountId,ownerId);
  assert.equal(stored.clientId,PREVIEW_CLIENT_ID);
  assert.ok(db.models.size>0);
  const record=[...db.models.values()][0];
  assert.equal(record.ciphertext.toString('utf8').includes(ownerId),false);
  assert.equal(record.ciphertext.toString('utf8').includes(PREVIEW_CLIENT_ID),false);
  assert.ok(db.calls.includes('insert'));
  assert.ok(db.calls.includes('select'));
  await stored.destroy();
  assert.equal(await provider.Grant.find(id),undefined);
  console.log('PASS: actual maintained oidc-provider saves, loads, and deletes encrypted model through private adapter.');
  console.log('No OAuth authorization code, user login, consent or token was issued.');
});
