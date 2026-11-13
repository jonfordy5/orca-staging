// Stage 20: ACTUAL SSL-backed PostgreSQL 17 and custom-login role test.
// Strictly for GitHub ephemeral Docker DB, with a synthetic CA/server cert.
// NO hosted Supabase database, real user, or real credentials are involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createVerifiedOrcaDatabaseConnector} from
  '../verified-supabase-db-connector.mjs';
import {createOwnedGrantRegistry} from '../grant-registry.mjs';
import {createVerifiedCurrentGrantQuery} from '../verified-current-grant-query.mjs';

const projectRef='vbziibatnejoswsdggga';
const host='db.'+projectRef+'.supabase.co';
const resource='https://mcp.orca.example/mcp';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='https://approved-ci.example/client.json';
if(process.env.ORCA_STAGE20_EPHEMERAL_TLS_ONLY!=='yes'||
   process.env.ORCA_STAGE20_DB_HOST!==host||
   process.env.ORCA_STAGE20_DB_NAME!=='postgres'||
   typeof process.env.ORCA_STAGE20_ISSUER_PASSWORD!=='string'||
   typeof process.env.ORCA_STAGE20_GRANT_PASSWORD!=='string'||
   !process.env.ORCA_STAGE20_CA_PATH?.startsWith('/'))
  throw Error('stage20_ephemeral_tls_test_only');
const caPem=readFileSync(process.env.ORCA_STAGE20_CA_PATH,'utf8');

function connector(purpose,password,cert=caPem){
  return createVerifiedOrcaDatabaseConnector({
    ClientClass:pg.Client,projectRef,
    mode:'direct',host,port:5432,database:'postgres',
    loginUser:purpose==='issuer'?'orca_owned_issuer_login':
      'orca_owned_mcp_grant_login',
    password,caPem:cert,purpose,maxConcurrent:3
  });
}

test('real TLS verifies private CA and DB hostname with two distinct NOINHERIT logins',async()=>{
  const issuer=connector('issuer',process.env.ORCA_STAGE20_ISSUER_PASSWORD);
  const grant=connector('grant_reader',process.env.ORCA_STAGE20_GRANT_PASSWORD);
  const first=await issuer.connect();
  const second=await grant.connect();
  try{
    const i=await first.query('SELECT session_user AS login, current_user AS role');
    const g=await second.query('SELECT session_user AS login, current_user AS role');
    assert.deepEqual(i.rows,[{
      login:'orca_owned_issuer_login',role:'orca_owned_issuer_writer'
    }]);
    assert.deepEqual(g.rows,[{
      login:'orca_owned_mcp_grant_login',role:'orca_owned_mcp_grant_reader'
    }]);
    assert.equal(first.query instanceof Function,true);
  }finally{
    first.release();second.release();
  }

  async function issuerQuery(sql,values=[]){
    const c=await issuer.connect();
    try{
      await c.query('BEGIN');
      const result=await c.query(sql,values);
      await c.query('COMMIT');
      return result;
    }catch{
      try{await c.query('ROLLBACK');}catch{}
      throw Error('stage20_issuer_query_unavailable');
    }finally{c.release();}
  }
  const issuerRegistry=createOwnedGrantRegistry({query:issuerQuery,resource});
  const readerQuery=createVerifiedCurrentGrantQuery({pool:grant,resource});
  const readerRegistry=createOwnedGrantRegistry({query:readerQuery,resource});
  const created=await issuerRegistry.createGrant({
    ownerId:ownerA,clientId:clientA,
    expiresAt:new Date(Date.now()+5*60*1000).toISOString(),
    assertApprovedConsent:async()=>true // EPHEMERAL TEST ONLY
  });
  const details={
    grantId:created.grantId,ownerId:ownerA,clientId:clientA,
    resource,scope:'orca:research.read'
  };
  assert.equal(await readerRegistry.isCurrentGrant(details),true);
  assert.equal(await readerRegistry.isCurrentGrant({...details,ownerId:ownerB}),false);
  assert.equal(await issuerRegistry.revokeGrant({
    grantId:created.grantId,verifiedOwnerId:ownerA
  }),true);
  assert.equal(await readerRegistry.isCurrentGrant(details),false);
});

test('wrong CA is rejected by actual TLS handshake before any SQL',async()=>{
  const invalidCa=readFileSync(process.env.ORCA_STAGE20_UNTRUSTED_CA_PATH,'utf8');
  const c=connector('grant_reader',process.env.ORCA_STAGE20_GRANT_PASSWORD,invalidCa);
  await assert.rejects(c.connect(),
    /verified_orca_private_database_connection_required/);
});
