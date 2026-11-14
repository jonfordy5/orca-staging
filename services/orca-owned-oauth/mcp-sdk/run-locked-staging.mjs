// Stage 14 deployment entry — intentionally locked OFF.
// A future live entry must be separately reviewed; changing environment
// variables cannot turn this entry point into a functioning MCP/OAuth server.
import {readFileSync} from 'node:fs';
import {createLockedStagingHttpsServer} from './locked-https.mjs';

const env=process.env;
function requireValue(name){
  const v=env[name];
  if(typeof v!=='string'||v.length===0)throw Error(name+'_required');
  return v;
}
function privateFile(name){
  const v=requireValue(name);
  if(!/^\/run\/secrets\/[A-Za-z0-9_.-]+$/.test(v)||v.includes('..'))
    throw Error('stage14_secret_mount_path_required');
  return readFileSync(v,'utf8');
}
if(requireValue('ORCA_STAGE14_LOCKED_ACK')!=='LOCKED_STAGING_ONLY')
  throw Error('explicit_locked_staging_ack_required');
// Public locked Compose deploy requires a separate operator acknowledgement.
// It NEVER grants permission to activate OAuth or any research tools.
if(env.ORCA_PUBLIC_LOCKED_DEPLOY_ACK!==undefined&&
   env.ORCA_PUBLIC_LOCKED_DEPLOY_ACK!=='I_APPROVE_PUBLIC_LOCKED_TLS_ONLY')
  throw Error('invalid_public_locked_deploy_ack');
if(requireValue('ORCA_MCP_ENABLED')!=='false'||
   requireValue('ORCA_OWNED_ISSUER_ENABLED')!=='false')
  throw Error('stage14_release_must_remain_disabled');
const rawPort=env.PORT||'8443';
const port=Number(rawPort);
if(!/^\d{4,5}$/.test(rawPort)||!Number.isSafeInteger(port)||
   port<1024||port>65535)
  throw Error('invalid_staging_https_port');
const host=env.ORCA_BIND_ADDRESS||'0.0.0.0';
if(!['0.0.0.0','127.0.0.1'].includes(host))
  throw Error('invalid_staging_bind_address');
const server=createLockedStagingHttpsServer({
  tlsKey:privateFile('ORCA_TLS_PRIVATE_KEY_FILE'),
  tlsCertificate:privateFile('ORCA_TLS_CERTIFICATE_FILE'),
  issuerOrigin:requireValue('ORCA_ISSUER_ORIGIN'),
  mcpResource:requireValue('ORCA_MCP_RESOURCE'),
  mcpEnabled:false,issuerEnabled:false
});
server.on('error',error=>{
  console.error('Locked ORCA HTTPS staging listener could not start:',error.code||'error');
  process.exitCode=1;
});
server.listen(port,host,()=>{
  console.log('ORCA locked HTTPS staging online; MCP and issuer disabled.');
});
function shutdown(){
  server.close(()=>{process.exitCode=0;});
}
process.once('SIGINT',shutdown);
process.once('SIGTERM',shutdown);
