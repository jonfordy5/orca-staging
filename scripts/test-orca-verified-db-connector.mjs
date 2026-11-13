import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVerifiedOrcaDatabaseConnector} from
  '../services/orca-owned-oauth/verified-supabase-db-connector.mjs';

const projectRef='vbziibatnejoswsdggga';
const directHost='db.'+projectRef+'.supabase.co';
const sessionHost='aws-0-us-east-1.pooler.supabase.com';
const password='synthetic-stage20-pg-password-not-real-123456';
const roles={
  issuer:{login:'orca_owned_issuer_login',db:'orca_owned_issuer_writer'},
  grant_reader:{login:'orca_owned_mcp_grant_login',db:'orca_owned_mcp_grant_reader'}
};

function caFixture(t){
  const folder=mkdtempSync(join(tmpdir(),'orca-stage20-ca-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const key=join(folder,'private.pem'),crt=join(folder,'root.crt');
  const r=spawnSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,'-out',crt,'-days','2',
    '-subj','/CN=ORCA disposable test CA'
  ],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,'OpenSSL required for synthetic X509 test CA');
  return readFileSync(crt,'utf8');
}
function fixture(t,{purpose='issuer',mode='direct',
  badTls=false,badRole=false,badLogin=false,
  failQuery=false,maxConcurrent=1}={}){
  const observed={configs:[],queries:[],ends:0};
  const caPem=caFixture(t);
  const role=roles[purpose];
  const host=mode==='direct'?directHost:sessionHost;
  const user=role.login+(mode==='direct'?'':'.'+projectRef);
  class ClientClass{
    constructor(config){
      observed.configs.push(config);
      this.connection={stream:{
        encrypted:!badTls,
        authorized:!badTls,
        servername:badTls?'evil.example.invalid':host
      }};
      this.login=user;
      this.role=user;
    }
    async connect(){}
    async query(sql,values){
      observed.queries.push({sql,values});
      if(failQuery)throw Error('synthetic_driver_failure: '+password);
      if(sql==='SELECT session_user AS login, current_user AS role'){
        return {rows:[{
          login:badLogin?'postgres':this.login,
          role:badRole?'postgres':this.role
        }]};
      }
      if(sql.startsWith('SET ROLE ')){
        this.role=sql.slice('SET ROLE '.length);
        return {rows:[]};
      }
      if(sql==='SELECT 1')return {rows:[{one:1}]};
      throw Error('unapproved_fake_query');
    }
    async end(){observed.ends++;}
  }
  const config={ClientClass,projectRef,mode,host,port:5432,
    database:'postgres',loginUser:user,password,caPem,purpose,maxConcurrent};
  const connector=createVerifiedOrcaDatabaseConnector(config);
  return {connector,config,observed};
}

test('issuer connection uses verify-full-equivalent TLS, correct role and no inherited admin user',async t=>{
  const f=fixture(t);
  const c=await f.connector.connect();
  assert.deepEqual(await c.query('SELECT 1'),{rows:[{one:1}]});
  assert.deepEqual(f.observed.queries.slice(0,3).map(q=>q.sql),[
    'SELECT session_user AS login, current_user AS role',
    'SET ROLE orca_owned_issuer_writer',
    'SELECT session_user AS login, current_user AS role'
  ]);
  const cfg=f.observed.configs[0];
  assert.equal(cfg.user,'orca_owned_issuer_login');
  assert.equal(cfg.host,directHost);
  assert.equal(cfg.port,5432);
  assert.equal(cfg.ssl.rejectUnauthorized,true);
  assert.equal(cfg.ssl.servername,directHost);
  assert.equal(cfg.ssl.minVersion,'TLSv1.2');
  assert.equal(cfg.ssl.ca,f.config.caPem);
  assert.ok(!Object.hasOwn(cfg,'connectionString'));
  assert.ok(!JSON.stringify(f.observed.queries).includes(password));
  c.release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.observed.ends,1);
  await assert.rejects(c.query('SELECT 1'),
    /verified_orca_private_database_connection_required/);
});

test('grant reader connects only as its own NOINHERIT login via SESSION pooler 5432',async t=>{
  const f=fixture(t,{purpose:'grant_reader',mode:'session_pooler'});
  const c=await f.connector.connect();
  assert.equal(f.observed.configs[0].user,
    'orca_owned_mcp_grant_login.'+projectRef);
  assert.equal(f.observed.configs[0].host,sessionHost);
  assert.ok(f.observed.queries.some(x=>
    x.sql==='SET ROLE orca_owned_mcp_grant_reader'));
  assert.ok(!f.observed.queries.some(x=>x.sql.includes('issuer_writer')));
  c.release();
});

test('wrong DB host, port, login, role, password, CA or transaction pooler is rejected before connecting',t=>{
  const f=fixture(t);
  for(const overrides of [
    {host:'127.0.0.1'},
    {host:'evil.supabase.co.attacker.invalid'},
    {mode:'session_pooler',host:directHost},
    {mode:'direct',host:sessionHost},
    {port:6543},
    {database:'template1'},
    {loginUser:'postgres'},
    {loginUser:'orca_owned_mcp_grant_login'},
    {password:'short'},
    {caPem:'NOT A CERT'},
    {purpose:'postgres'},
    {maxConcurrent:100}
  ])assert.throws(()=>createVerifiedOrcaDatabaseConnector({
    ...f.config,...overrides
  }),/verified_orca_private_database_connection_required/);
  assert.equal(f.observed.configs.length,0);
});
test('failed TLS, wrong login, wrong DB role and database errors fail closed and close connections',async t=>{
  for(const variant of [
    {badTls:true},{badLogin:true},{badRole:true},{failQuery:true}
  ]){
    const f=fixture(t,variant);
    await assert.rejects(f.connector.connect(),
      /verified_orca_private_database_connection_required/);
    assert.equal(f.observed.ends,1,'any rejected session must be closed');
    if(variant.badTls)
      assert.equal(f.observed.queries.length,0,
        'TLS errors cannot execute SQL');
    assert.ok(!JSON.stringify(f.observed.queries).includes(password));
  }
});

test('connection concurrency cap denies overload and never reuses a role-bearing session',async t=>{
  const f=fixture(t,{maxConcurrent:1});
  const a=await f.connector.connect();
  await assert.rejects(f.connector.connect(),
    /verified_orca_private_database_connection_required/);
  assert.equal(f.observed.configs.length,1);
  a.release();
  await new Promise(resolve=>setImmediate(resolve));
  const b=await f.connector.connect();
  assert.equal(f.observed.configs.length,2);
  b.release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.observed.ends,2);
});
