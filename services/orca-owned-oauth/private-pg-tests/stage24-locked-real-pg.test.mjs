// Stage 24: locked issuer startup against a disposable, CA-verified PG 17.
// Runs ONLY with the Stage 20 isolated Docker PostgreSQL and synthetic secrets.
// Never connects to an actual hosted Supabase project or serves a listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import Provider from 'oidc-provider';
import pg from 'pg';
import {createStage22LockedIssuerHostStartup} from
  '../locked-issuer-host-startup.mjs';
import {createVerifiedOrcaDatabaseConnector} from
  '../verified-supabase-db-connector.mjs';

const project='vbziibatnejoswsdggga';
const hostname='db.'+project+'.supabase.co';
if(process.env.ORCA_STAGE20_EPHEMERAL_TLS_ONLY!=='yes'||
   process.env.ORCA_STAGE20_DB_HOST!==hostname||
   process.env.ORCA_STAGE20_DB_NAME!=='postgres'||
   !process.env.ORCA_STAGE20_CA_PATH?.startsWith('/')||
   !process.env.ORCA_STAGE20_ISSUER_PASSWORD||
   process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')
  throw Error('stage24_requires_disposable_postgresql_tls_only');

const env=Object.freeze({
  ORCA_STAGE22_LOCKED_ACK:'OFFLINE_ASSEMBLY_ONLY',
  ORCA_OWNED_ISSUER_ENABLED:'false',
  ORCA_MCP_ENABLED:'false',
  ORCA_DB_PROJECT_REF:project,
  ORCA_SUPABASE_URL:'https://'+project+'.supabase.co',
  ORCA_DB_MODE:'direct',
  ORCA_DB_HOST:hostname,
  ORCA_DB_LOGIN_USER:'orca_owned_issuer_login',
  ORCA_ISSUER_ORIGIN:'https://issuer.orca.example.invalid',
  ORCA_MCP_RESOURCE:'https://mcp.orca.example.invalid/mcp',
  ORCA_OAUTH_CLIENT_ID:'stage24-test-only-client',
  ORCA_OAUTH_REDIRECT_URI:'https://callback.example.invalid/authorized'
});
const randomKey=()=>randomBytes(32).toString('base64url');
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'orca-stage24-tls-'));
  const directory=join(root,'secrets');
  mkdirSync(directory,{mode:0o700});
  const write=(name,content)=>writeFileSync(join(directory,name),
    typeof content==='string'?content:JSON.stringify(content),{mode:0o600});
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  write('signing-jwk.json',{
    ...privateKey.export({format:'jwk'}),kid:'stage24-signing-key',
    alg:'ES256',use:'sig'
  });
  write('provider-cookie-keys.json',[randomKey(),randomKey()]);
  write('provider-keyring.json',{
    currentKeyId:'stage24-provider-key',
    keys:{'stage24-provider-key':randomKey()}
  });
  write('browser-session-keyring.json',{keys:[
    {id:'stage24-browser-key',key:randomKey()}
  ]});
  write('issuer-db-password.txt',process.env.ORCA_STAGE20_ISSUER_PASSWORD);
  write('postgres-ca.pem',readFileSync(process.env.ORCA_STAGE20_CA_PATH,'utf8'));
  write('supabase-publishable-key.txt',
    'sb_publishable_'+randomBytes(32).toString('base64url'));
  return {root,directory};
}
function response(){
  return {status:null,body:null,headersSent:false,writableEnded:false,
    writeHead(status){this.status=status;this.headersSent=true;},
    end(body){this.body=body;this.writableEnded=true;}};
}
test('actual CA-verified private login and stage22 secret-mounted issuer stay locked',async()=>{
  const {root,directory}=fixture();
  let calledSupabase=0;
  try{
    // Real PostgreSQL SSL handshake and role verification, using only
    // the disposable Docker DB and ephemeral credentials from this CI job.
    const connector=createVerifiedOrcaDatabaseConnector({
      ClientClass:pg.Client,projectRef:project,mode:'direct',
      host:hostname,database:'postgres',port:5432,
      loginUser:'orca_owned_issuer_login',
      password:process.env.ORCA_STAGE20_ISSUER_PASSWORD,
      caPem:readFileSync(process.env.ORCA_STAGE20_CA_PATH,'utf8'),
      purpose:'issuer'
    });
    const connection=await connector.connect();
    try{
      const identity=await connection.query(
        'SELECT session_user AS login, current_user AS role'
      );
      assert.deepEqual(identity.rows,[{
        login:'orca_owned_issuer_login',role:'orca_owned_issuer_writer'
      }]);
    }finally{connection.release();}

    // Build the actual provider from the same source of mounted secrets.
    // Startup and protected routes must NEVER call Postgres or Supabase.
    const service=createStage22LockedIssuerHostStartup({
      env,secretDirectory:directory,
      ProviderClass:Provider,ClientClass:pg.Client,
      fetchImpl:async()=>{calledSupabase++;throw Error('NO_SUPABASE_CI_CALL');}
    });
    assert.equal(service.publicAuthorizationEnabled,false);
    assert.equal(service.mode,'locked-staging');
    for(const route of ['/auth','/token','/.well-known/oauth-authorization-server',
      '/interaction/abcdefgh','/session/bootstrap']){
      const res=response();
      await service.handle({url:route,method:'GET',headers:{}},res);
      assert.equal(res.status,503,route);
    }
    assert.equal(calledSupabase,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
