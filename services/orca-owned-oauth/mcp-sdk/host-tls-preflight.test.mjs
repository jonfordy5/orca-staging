import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectLockedDeploymentTls} from './host-tls-preflight.mjs';

const HOST='mcp.orca-staging.net';
const ORIGIN='https://auth.orca-staging.net';
function certificateFixture(t,hostname=HOST){
  const folder=mkdtempSync(join(tmpdir(),'orca-stage16-cert-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const keyPath=join(folder,'key.pem');
  const certPath=join(folder,'cert.pem');
  const args=[
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyPath,'-out',certPath,'-days','30',
    '-subj','/CN='+hostname,
    '-addext','subjectAltName=DNS:'+hostname
  ];
  const out=spawnSync('openssl',args,{encoding:'utf8',timeout:8000});
  assert.equal(out.status,0,'isolated openssl fixture generation');
  chmodSync(keyPath,0o600);
  return {folder,keyPath,certPath,privateKeyPem:readFileSync(keyPath,'utf8'),
    certificatePem:readFileSync(certPath,'utf8')};
}
test('matched cert SAN and private key are safe for pre-release (but not CA verification)',t=>{
  const f=certificateFixture(t);
  const result=inspectLockedDeploymentTls({...f,hostname:HOST});
  assert.equal(result.status,'passed');
  assert.equal(result.publicDeploymentAuthorized,false);
  assert.equal(result.certificateMatchesHostname,true);
  assert.equal(result.privateKeyMatchesCertificate,true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
  assert.ok(!JSON.stringify(result).includes(f.privateKeyPem));
});
test('reject wrong hostname, expired threshold, invalid certificate and wrong key',t=>{
  const a=certificateFixture(t);
  const b=certificateFixture(t,'other.orca-staging.net');
  for(const input of [
    {...a,hostname:'wrong.orca-staging.net'},
    {...a,hostname:HOST,minimumDays:45},
    {...a,hostname:HOST,certificatePem:'NOT A CERT'},
    {...a,hostname:HOST,privateKeyPem:b.privateKeyPem},
    {...a,hostname:HOST,now:()=>0}
  ]){
    assert.throws(()=>inspectLockedDeploymentTls(input),
      /tls_deployment_material_rejected/);
  }
});
test('operator CLI checks local PEM without dumping material or contacting a network',t=>{
  const f=certificateFixture(t);
  const env={
    ...process.env,
    ORCA_MCP_RESOURCE:'https://'+HOST+'/mcp',
    ORCA_ISSUER_ORIGIN:ORIGIN,
    ORCA_SECRETS_DIR:f.folder
  };
  const invoke=override=>spawnSync(process.execPath,
    ['host-tls-preflight.cli.mjs'],
    {cwd:new URL('.',import.meta.url),env:{...env,...override},
      encoding:'utf8',timeout:8000});
  const ok=invoke({});
  assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/"status": "passed"/);
  assert.doesNotMatch(ok.stdout,/BEGIN .*PRIVATE KEY|BEGIN CERTIFICATE/);
  const badHost=invoke({ORCA_MCP_RESOURCE:'https://other.orca-staging.net/mcp'});
  assert.equal(badHost.status,1);
  assert.match(badHost.stderr,/BLOCKED:/);
  assert.doesNotMatch(badHost.stderr,/PRIVATE KEY-----/);
  const badDir=invoke({ORCA_SECRETS_DIR:'./relative'});
  assert.equal(badDir.status,1);
});
test('CLI rejects world-readable private key rather than reporting a valid deploy',t=>{
  const f=certificateFixture(t);
  chmodSync(f.keyPath,0o644);
  const r=spawnSync(process.execPath,['host-tls-preflight.cli.mjs'],{
    cwd:new URL('.',import.meta.url),
    env:{...process.env,
      ORCA_MCP_RESOURCE:'https://'+HOST+'/mcp',
      ORCA_ISSUER_ORIGIN:ORIGIN,ORCA_SECRETS_DIR:f.folder},
    encoding:'utf8',timeout:8000
  });
  assert.equal(r.status,1);
  assert.match(r.stderr,/BLOCKED:/);
});
