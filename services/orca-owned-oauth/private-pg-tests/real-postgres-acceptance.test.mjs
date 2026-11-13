// STAGE 19: ACTUAL PostgreSQL storage integration; CI ISOLATION ONLY.
// Never run against a hosted Supabase database. The hardcoded guard refuses
// any non-127.0.0.1 PGHOST or non-ephemeral database name.
// All accounts, grants, encryption keys and browser tokens are synthetic.
// PostgreSQL roles are created in the isolated CI service using review-only SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {makeEncryptedPgOidcAdapter} from '../encrypted-pg-oidc-adapter.mjs';
import {createOwnedGrantRegistry} from '../grant-registry.mjs';
import {createPrivateConsentChallenges} from '../consent-challenge.mjs';
import {createPrivatePostgresSessionStore,
  createOpaqueBrowserSessionBridge} from '../opaque-browser-session.mjs';
import {createVerifiedCurrentGrantQuery} from
  '../verified-current-grant-query.mjs';

const resource='https://mcp.orca.example/mcp';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='https://approved.example/client-a.json';
const clientB='https://approved.example/client-b.json';

if(process.env.ORCA_SQL_EPHEMERAL_TEST_ONLY!=='yes'||
   process.env.PGHOST!=='127.0.0.1'||
   process.env.PGDATABASE!=='ephemeral_orca_oauth_roles'||
   process.env.PGUSER!=='postgres')
  throw Error('forbidden_non_ephemeral_database_test');

const connection={
  host:process.env.PGHOST,
  port:Number(process.env.PGPORT||5432),
  database:process.env.PGDATABASE,
  user:process.env.PGUSER,
  password:process.env.PGPASSWORD,
  connectionTimeoutMillis:2000,
  statement_timeout:3500,
  ssl:false // TEST POSTGRES ON LOCALHOST ONLY, NOT AN ACCEPTABLE CLOUD CONFIG.
};
const {Client}=pg;
let queryCount=0;
async function issuerQuery(sql,params=[]){
  const client=new Client(connection);
  await client.connect();
  let started=false;
  try{
    await client.query('BEGIN');
    started=true;
    await client.query('SET LOCAL ROLE orca_owned_issuer_writer');
    const current=await client.query('SELECT current_user AS name');
    assert.equal(current.rows[0].name,'orca_owned_issuer_writer');
    queryCount++;
    const result=await client.query(sql,params);
    await client.query('COMMIT');
    started=false;
    return result;
  }catch(error){
    if(started){try{await client.query('ROLLBACK');}catch{}}
    throw error;
  }finally{await client.end();}
}
// Isolated privileged test role change is NOT a production pattern.
// A future server uses a dedicated authenticated least-privilege DB login,
// strict CA-verified TLS and zero ability to SET arbitrary privileges.
const grantReaderPool={
  async connect(){
    const client=new Client(connection);
    await client.connect();
    await client.query('SET ROLE orca_owned_mcp_grant_reader');
    return {
      query:(sql,values)=>client.query(sql,values),
      release:()=>{client.end().catch(()=>{});}
    };
  }
};
const readerQuery=createVerifiedCurrentGrantQuery({
  pool:grantReaderPool,resource
});
const registry=createOwnedGrantRegistry({query:issuerQuery,resource});
const currentRegistry=createOwnedGrantRegistry({
  query:readerQuery,resource
});

test('actual isolated PostgreSQL stores two issuer grants and MCP reads only verified owner',async()=>{
  const expiry=new Date(Date.now()+300000).toISOString();
  const approved=async()=>true; // Test-only simulated explicit human consent
  const a=await registry.createGrant({
    ownerId:ownerA,clientId:clientA,expiresAt:expiry,
    assertApprovedConsent:approved
  });
  const b=await registry.createGrant({
    ownerId:ownerB,clientId:clientB,expiresAt:expiry,
    assertApprovedConsent:approved
  });
  for(const g of [a,b]){
    assert.equal(await currentRegistry.isCurrentGrant({
      grantId:g.grantId,ownerId:g.ownerId,clientId:g.clientId,
      resource,scope:'orca:research.read'
    }),true);
  }
  assert.equal(await currentRegistry.isCurrentGrant({
    grantId:a.grantId,ownerId:ownerB,clientId:clientA,
    resource,scope:'orca:research.read'
  }),false);
  assert.equal(await currentRegistry.isCurrentGrant({
    grantId:a.grantId,ownerId:ownerA,clientId:clientB,
    resource,scope:'orca:research.read'
  }),false);
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientA,
    grantId:a.grantId,providerGrantId:'synthetic-provider-grant-a'
  }),true);
  assert.equal((await registry.lookupOwnedGrant({
    providerGrantId:'synthetic-provider-grant-a',
    ownerId:ownerA,clientId:clientA,resource,scope:'orca:research.read'
  }))?.grantId,a.grantId);
  await registry.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId});
  assert.equal(await currentRegistry.isCurrentGrant({
    grantId:a.grantId,ownerId:ownerA,clientId:clientA,
    resource,scope:'orca:research.read'
  }),false);
  assert.equal(await currentRegistry.isCurrentGrant({
    grantId:b.grantId,ownerId:ownerB,clientId:clientB,
    resource,scope:'orca:research.read'
  }),true);
});

test('real PG encrypted OIDC models survive new adapter instance and block code replay',async()=>{
  const keys={'local-encryption-key-0001':randomBytes(32)};
  const Adapter=makeEncryptedPgOidcAdapter({
    query:issuerQuery,currentKeyId:'local-encryption-key-0001',
    keyring:keys
  });
  const first=new Adapter('AuthorizationCode');
  const id='ephemeral-oidc-auth-code-001';
  const data={grantId:'test-provider-grant-001',foo:'encrypted-original-value'};
  await first.upsert(id,data,300);
  const later=new Adapter('AuthorizationCode');
  const recovered=await later.find(id);
  assert.equal(recovered.foo,data.foo);
  const contents=await issuerQuery(
    "select ciphertext from orca_owned_oauth_private.provider_models where model_type='AuthorizationCode'"
  );
  assert.ok(Buffer.isBuffer(contents.rows[0].ciphertext));
  assert.equal(contents.rows[0].ciphertext.includes(
    Buffer.from('encrypted-original-value')),false);
  await later.consume(id);
  await assert.rejects(later.consume(id),/already_consumed_or_expired/);
  await later.destroy(id);
  assert.equal(await first.find(id),undefined);
});

test('real PostgreSQL enforces owner/client/browser-bound one-time CSRF consumption',async()=>{
  const store=createPrivateConsentChallenges({query:issuerQuery,resource});
  const scope={ownerId:ownerA,clientId:clientA,
    interactionUid:'interaction-test-unique-0001',
    browserSessionId:'a'.repeat(43)};
  const first=await store.prepare(scope);
  assert.equal(await store.consume({...scope,...first,ownerId:ownerB}),false);
  assert.equal(await store.consume({...scope,...first}),true);
  assert.equal(await store.consume({...scope,...first}),false);
});

test('real PG stores encrypted opaque browser session then revokes the exact cookie',async()=>{
  const store=createPrivatePostgresSessionStore({query:issuerQuery});
  const fixtureToken='syntheticheader.syntheticuser.tokenforlocalhost';
  const session=createOpaqueBrowserSessionBridge({
    issuerOrigin:'https://auth.orca.example',
    keyring:[{id:'stage19-crypto-key',key:randomBytes(32)}],
    store,
    auth:{getUser:async token=>{
      assert.equal(token,fixtureToken);
      return {data:{user:{id:ownerA}}};
    }},
    ownerScopedProfileRead:async()=>({owner_id:ownerA,opted_in:true}),
    isTrustedHttps:()=>true // TEST ONLY: real host requires actual TLS socket
  });
  const common={host:'auth.orca.example',origin:'https://auth.orca.example',
    'content-type':'application/json'};
  const issued=await session.issueSessionCookie({
    method:'POST',headers:common
  },{supabaseAccessToken:fixtureToken});
  assert.ok(!issued.setCookie.includes(fixtureToken));
  const cookie=issued.setCookie.split(';')[0];
  const read=await session.readTrustedBrowserSession({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  });
  assert.equal(read.supabaseAccessToken,fixtureToken);
  const cleared=await session.clearSessionCookie({
    method:'POST',headers:{...common,cookie}
  });
  assert.match(cleared,/Max-Age=0/);
  await assert.rejects(session.readTrustedBrowserSession({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  }),/invalid_or_expired_browser_session/);
});

test('issuer checks never touch a real Supabase endpoint or publicly exposed key',async()=>{
  assert.ok(queryCount>10,'must exercise actual PostgreSQL operations');
  const roles=await issuerQuery('select current_user as role');
  assert.equal(roles.rows[0].role,'orca_owned_issuer_writer');
  await assert.rejects(readerQuery(
    "select * from orca_owned_oauth_private.browser_sessions",[]
  ),/private_current_grant_lookup_unavailable/);
});
