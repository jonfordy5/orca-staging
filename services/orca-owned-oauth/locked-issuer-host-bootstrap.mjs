// ORCA Stage 26 — one guarded boot path from private secret mounts
// to real, loopback-only TLS hosting. STILL NO OAUTH AUTHORIZATION.
// No import-time IO, no public listener, no DB call, no production secrets.
import {
  constants,lstatSync,fstatSync,openSync,readFileSync,closeSync,realpathSync
} from 'node:fs';
import {resolve,join} from 'node:path';
import {createStage22LockedIssuerHostStartup} from
  './locked-issuer-host-startup.mjs';
import {createStage25LockedIssuerTlsHost} from
  './locked-issuer-tls-server.mjs';

const DEFAULT_MOUNT='/run/secrets/orca-owned-oauth';
const fail=()=>{throw Error('stage26_locked_issuer_bootstrap_rejected');};
function protectedTlsFile(directory,name,maxBytes){
  let fd;
  try{
    if(typeof directory!=='string'||!directory.startsWith('/')||
       resolve(directory)!==directory||
       realpathSync(directory)!==directory)fail();
    const dir=lstatSync(directory);
    if(!dir.isDirectory()||dir.uid!==process.getuid()||
       (dir.mode&0o077)!==0||(dir.mode&0o500)!==0o500)fail();
    // Only two literal file names are ever passed by this module.
    const path=join(directory,name);
    const before=lstatSync(path);
    if(!before.isFile()||before.nlink!==1||
       before.uid!==process.getuid()||
       (before.mode&0o077)!==0||(before.mode&0o111)!==0||
       (before.mode&0o400)===0||before.size<100||
       before.size>maxBytes)fail();
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const after=fstatSync(fd);
    if(!after.isFile()||after.nlink!==1||after.uid!==before.uid||
       after.mode!==before.mode||after.dev!==before.dev||
       after.ino!==before.ino||after.size!==before.size)fail();
    const data=readFileSync(fd,'utf8');
    if(Buffer.byteLength(data)>maxBytes)fail();
    return data;
  }catch{fail();}
  finally{if(fd!==undefined){try{closeSync(fd);}catch{}}}
}
/**
 * Fully connects protected secret validation, verified issuer configuration,
 * and a direct TLS Node server, with a strictly loopback-only listen method.
 * This is a LOCKED rehearsal artifact; live OAuth needs a distinct reviewed
 * activation implementation and must not be toggled by environment flags.
 */
export function createStage26LockedIssuerHost({
  env=process.env,secretDirectory=DEFAULT_MOUNT,
  ProviderClass,ClientClass,fetchImpl=fetch
}={}){
  try{
    const assembly=createStage22LockedIssuerHostStartup({
      env,secretDirectory,ProviderClass,ClientClass,fetchImpl
    });
    const tlsPrivateKey=protectedTlsFile(
      secretDirectory,'issuer-tls-private-key.pem',16384);
    const tlsCertificate=protectedTlsFile(
      secretDirectory,'issuer-tls-certificate.pem',32768);
    return createStage25LockedIssuerTlsHost({
      assembly,tlsPrivateKey,tlsCertificate
    });
  }catch{fail();}
}
