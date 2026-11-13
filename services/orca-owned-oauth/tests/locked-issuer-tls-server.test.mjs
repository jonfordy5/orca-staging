// Stage 25: real loopback TLS client/server tests. Ephemeral keys only.
// No public bind, real Supabase connection, OAuth token or DB call.
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import {
  mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import Provider from 'oidc-provider';
import {createStage22LockedIssuerHostStartup} from '../locked-issuer-host-startup.mjs';
import {createStage25LockedIssuerTlsHost} from '../locked-issuer-tls-server.mjs';

const hostname='issuer.orca.example.invalid';
const issuerOrigin='https://'+hostname;
const project='vbziibatnejoswsdggga';
const env={
  ORCA_STAGE22_LOCKED_ACK:'OFFLINE_ASSEMBLY_ONLY',
  ORCA_OWNED_ISSUER_ENABLED:'false',
  ORCA_MCP_ENABLED:'false',
  ORCA_DB_PROJECT_REF:project,
  ORCA_SUPABASE_URL:'https://'+project+'.supabase.co',
  ORCA_DB_MODE:'direct',
  ORCA_DB_HOST:'db.'+project+'.supabase.co',
  ORCA_DB_LOGIN_USER:'orca_owned_issuer_login',
  ORCA_ISSUER_ORIGIN:issuerOrigin,
  ORCA_MCP_RESOURCE:'https://mcp.orca.example.invalid/mcp',
  ORCA_OAUTH_CLIENT_ID:'stage25-test-only-client',
  ORCA_OAUTH_REDIRECT_URI:'https://callback.example.invalid/authorized'
};
const key=()=>randomBytes(32).toString('base64url');
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'orca-stage25-'));
  const directory=join(root,'secrets');
  mkdirSync(directory,{mode:0o700});
  const save=(name,value)=>writeFileSync(join(directory,name),
    typeof value==='string'?value:JSON.stringify(value),{mode:0o600});
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  save('signing-jwk.json',{
    ...privateKey.export({format:'jwk'}),kid:'stage25-signing-key'
  });
  save('provider-cookie-keys.json',[key(),key()]);
  save('provider-keyring.json',{
    currentKeyId:'stage25-provider-key',
    keys:{'stage25-provider-key':key()}
  });
  save('browser-session-keyring.json',{keys:[
    {id:'stage25-browser-key',key:key()}
  ]});
  save('issuer-db-password.txt',randomBytes(48).toString('base64url'));
  save('supabase-publishable-key.txt','sb_publishable_'+key());
  const tlsPrivatePath=join(root,'tls-private.key');
  const tlsCertificatePath=join(root,'tls-public.crt');
  execFileSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes','-sha256',
    '-keyout',tlsPrivatePath,'-out',tlsCertificatePath,'-days','30',
    '-subj','/CN='+hostname,'-addext','subjectAltName=DNS:'+hostname
  ],{stdio:'ignore'});
  const tlsPrivateKey=readFileSync(tlsPrivatePath,'utf8');
  const tlsCertificate=readFileSync(tlsCertificatePath,'utf8');
  save('postgres-ca.pem',tlsCertificate);
  const assembly=createStage22LockedIssuerHostStartup({
    env,secretDirectory:directory,ProviderClass:Provider,
    ClientClass:class {},fetchImpl:async()=>{throw Error('NO_EXTERNAL_HTTP');}
  });
  return {root,assembly,tlsPrivateKey,tlsCertificate};
}
function request(port,ca,path,headers={}){
  return new Promise((resolve,reject)=>{
    const req=https.request({
      hostname:'127.0.0.1',port,path,method:'GET',
      servername:hostname,ca,rejectUnauthorized:true,
      timeout:5000,headers:{host:hostname,...headers}
    },res=>{
      const chunks=[];
      res.on('data',part=>chunks.push(part));
      res.on('end',()=>resolve({
        status:res.statusCode,headers:res.headers,
        body:Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error',reject);
    req.on('timeout',()=>req.destroy(Error('test_timeout')));
    req.end();
  });
}
test('Stage 22 assembly can answer actual strict-TLS loopback requests, always OFF',async()=>{
  const f=fixture();
  let server;
  try{
    server=createStage25LockedIssuerTlsHost(f);
    assert.equal(server.listening,false);
    assert.equal(server.mode,'loopback-locked-https');
    assert.ok(!Object.hasOwn(server,'server'),'raw listener must remain private');
    const address=await server.listenLoopback();
    assert.equal(address.address,'127.0.0.1');
    assert.equal(server.listening,true);
    assert.throws(()=>server.listenLoopback(),/stage25_locked_https_issuer_rejected/);
    for(const path of [
      '/auth','/token','/.well-known/oauth-authorization-server',
      '/interaction/abcdefghijkl','/session/bootstrap','/healthz'
    ]){
      const res=await request(address.port,f.tlsCertificate,path);
      assert.equal(res.status,503,path);
      assert.equal(res.headers['cache-control'],'no-store',path);
      assert.equal(JSON.parse(res.body).error,'orca_issuer_not_deployed');
    }
    const badHost=await request(address.port,f.tlsCertificate,'/auth',{
      host:'attacker.invalid','x-forwarded-host':hostname,
      'x-forwarded-proto':'https'
    });
    assert.equal(badHost.status,421);
    assert.equal(JSON.parse(badHost.body).error,'unapproved_tls_host');
  }finally{
    await server?.close();
    rmSync(f.root,{recursive:true,force:true});
  }
});
test('Stage25 refuses bad TLS key, certificate hostname and unlocked assembly',()=>{
  const f=fixture();
  try{
    const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    assert.throws(()=>createStage25LockedIssuerTlsHost({
      ...f,tlsPrivateKey:privateKey.export({format:'pem',type:'pkcs8'})
    }),/stage25_locked_https_issuer_rejected/);
    assert.throws(()=>createStage25LockedIssuerTlsHost({
      ...f,assembly:Object.freeze({
        issuer:'https://wrong-issuer.example.invalid',
        mode:'locked-staging',publicAuthorizationEnabled:false,
        handle:f.assembly.handle
      })
    }),/stage25_locked_https_issuer_rejected/);
    assert.throws(()=>createStage25LockedIssuerTlsHost({
      ...f,assembly:{...f.assembly,publicAuthorizationEnabled:true}
    }),/stage25_locked_https_issuer_rejected/);
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
