// Draft persistent adapter for panva/oidc-provider's documented adapter API.
// CODE ONLY. NO DATABASE TABLE, KEY, SERVER, OR CLIENT IS DEPLOYED.
// Uses a restricted, private direct PostgreSQL connection, never Supabase REST.
// Every opaque model identifier is SHA-256 hashed before storage; the entire
// provider payload is AES-256-GCM encrypted in the Node issuer process.
// Key bytes are obtained from external secret management, never source/DB.
// Not yet integrated/tested against a running oidc-provider release.
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

const MAX_TTL=31*24*60*60; // bound all temporary auth state
const MAX_PAYLOAD_BYTES=128*1024;
const MODEL_TYPES=new Set([
  'Grant','Session','AccessToken','AuthorizationCode','RefreshToken',
  'Interaction','ReplayDetection','Client','ClientCredentials',
  'InitialAccessToken','RegistrationAccessToken','DeviceCode',
  'BackchannelAuthenticationRequest','PushedAuthorizationRequest',
  'PreAuthorizedCode'
]);
const digest=s=>createHash('sha256').update(s,'utf8').digest();
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

function checkedId(id){
  if(typeof id!=='string'||!id||id.length>1024)throw Error('invalid_model_identifier');
  return digest(id);
}
function ensureResult(result){
  if(!result||typeof result.rowCount!=='number'||!Array.isArray(result.rows))
    throw Error('private_provider_store_failed');
  return result;
}
function seal(payload,model,referenceHash,key,keyId){
  if(!isRecord(payload))throw Error('invalid_oidc_payload');
  const plain=Buffer.from(JSON.stringify(payload),'utf8');
  if(!plain.length||plain.length>MAX_PAYLOAD_BYTES)throw Error('invalid_oidc_payload_size');
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const aad=Buffer.from('orca-oidc-v1:'+model+':'+referenceHash.toString('hex'));
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {keyId,iv,ciphertext,tag};
}
function open(row,model,keys){
  if(!isRecord(row)||typeof row.key_id!=='string')throw Error('invalid_stored_model');
  const key=keys[row.key_id];
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('unknown_or_expired_key');
  const ref=Buffer.from(row.model_id_hash||[]);
  const iv=Buffer.from(row.iv||[]),tag=Buffer.from(row.tag||[]);
  if(ref.length!==32||iv.length!==12||tag.length!==16)
    throw Error('invalid_encrypted_model');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(Buffer.from('orca-oidc-v1:'+model+':'+ref.toString('hex')));
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext||[])),decipher.final()
  ]);
  if(!plain.length||plain.length>MAX_PAYLOAD_BYTES)throw Error('invalid_stored_model_size');
  const payload=JSON.parse(plain.toString('utf8'));
  if(!isRecord(payload))throw Error('invalid_stored_model_payload');
  if(row.consumed_at!=null)return {...payload,consumed:row.consumed_at};
  return payload;
}

export function makeEncryptedPgOidcAdapter({query,currentKeyId,keyring}={}){
  if(typeof query!=='function'||typeof currentKeyId!=='string'||
      currentKeyId.length<8||currentKeyId.length>128||
      !isRecord(keyring)||!Buffer.isBuffer(keyring[currentKeyId])||
      keyring[currentKeyId].length!==32)
    throw Error('restricted_postgres_and_encryption_keys_required');
  // The map may contain earlier keys for controlled rotation; the newest key
  // encrypts all new/updated model state. Keep old keys until records expire.
  const keys=Object.freeze({...keyring});

  return class EncryptedPgOidcAdapter {
    constructor(model) {
      if(typeof model!=='string'||!MODEL_TYPES.has(model))
        throw Error('unsupported_oidc_model');
      this.model=model;
    }

    async upsert(id,payload,expiresIn) {
      const ref=checkedId(id);
      if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>MAX_TTL)
        throw Error('finite_model_ttl_required');
      const enc=seal(payload,this.model,ref,keys[currentKeyId],currentKeyId);
      const grantRef=(typeof payload.grantId==='string'&&payload.grantId)
        ? digest(payload.grantId) : this.model==='Grant'?ref:null;
      const uidRef=(this.model==='Session'&&typeof payload.uid==='string'&&payload.uid)
        ? digest(payload.uid):null;
      const result=ensureResult(await query(
        'insert into orca_owned_oauth_private.provider_models '+
        '(model_type,model_id_hash,grant_id_hash,uid_hash,key_id,iv,ciphertext,tag,expires_at) '+
        'values ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+($9::integer * interval \'1 second\')) '+
        'on conflict (model_type,model_id_hash) do update set '+
        'grant_id_hash=excluded.grant_id_hash,uid_hash=excluded.uid_hash, '+
        'key_id=excluded.key_id,iv=excluded.iv,ciphertext=excluded.ciphertext, '+
        'tag=excluded.tag,expires_at=excluded.expires_at '+
        'where orca_owned_oauth_private.provider_models.consumed_at is null '+
        'returning model_id_hash',
        [this.model,ref,grantRef,uidRef,enc.keyId,enc.iv,
          enc.ciphertext,enc.tag,expiresIn]
      ));
      if(result.rowCount!==1)throw Error('model_already_consumed');
    }

    async find(id) {
      const ref=checkedId(id);
      const result=ensureResult(await query(
        'select model_id_hash,key_id,iv,ciphertext,tag,consumed_at '+
        'from orca_owned_oauth_private.provider_models '+
        'where model_type=$1 and model_id_hash=$2 and expires_at>clock_timestamp() limit 1',
        [this.model,ref]
      ));
      return result.rows.length?open(result.rows[0],this.model,keys):undefined;
    }

    async findByUid(uid) {
      if(this.model!=='Session')throw Error('uid_lookup_only_for_sessions');
      const ref=checkedId(uid);
      const result=ensureResult(await query(
        'select model_id_hash,key_id,iv,ciphertext,tag,consumed_at '+
        'from orca_owned_oauth_private.provider_models '+
        'where model_type=$1 and uid_hash=$2 and expires_at>clock_timestamp() limit 1',
        [this.model,ref]
      ));
      return result.rows.length?open(result.rows[0],this.model,keys):undefined;
    }

    async findByUserCode(_userCode) {
      // Device authorization is not in the pilot. Fail closed if called.
      throw Error('device_flow_not_enabled');
    }

    async consume(id) {
      const ref=checkedId(id);
      // SQL performs an atomic compare-and-set. Two simultaneous code
      // exchanges cannot both mark the same authorization code consumed.
      const result=ensureResult(await query(
        'update orca_owned_oauth_private.provider_models '+
        'set consumed_at=clock_timestamp() '+
        'where model_type=$1 and model_id_hash=$2 and consumed_at is null '+
        'and expires_at>clock_timestamp() returning model_id_hash',
        [this.model,ref]
      ));
      if(result.rowCount!==1)throw Error('already_consumed_or_expired');
    }

    async destroy(id) {
      const ref=checkedId(id);
      await query(
        'delete from orca_owned_oauth_private.provider_models '+
        'where model_type=$1 and model_id_hash=$2',
        [this.model,ref]
      );
    }

    async revokeByGrantId(grantId) {
      const ref=checkedId(grantId);
      await query(
        'delete from orca_owned_oauth_private.provider_models '+
        'where model_type=$1 and (grant_id_hash=$2 or '+
        '(model_type=\'Grant\' and model_id_hash=$2))',
        [this.model,ref]
      );
    }
  };
}
