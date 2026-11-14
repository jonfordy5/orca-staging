#!/usr/bin/env node
// Run ON THE OPERATOR HOST before any public locked-only deployment.
// Reads both PEM files locally, never sends or prints either value.
// Check remote CA trust separately with deployment-preflight.cli.mjs.
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {inspectLockedDeploymentTls} from './host-tls-preflight.mjs';
import {validateDeploymentTargets} from './deployment-preflight.mjs';

try{
  const targets=validateDeploymentTargets({
    resource:process.env.ORCA_MCP_RESOURCE,
    issuer:process.env.ORCA_ISSUER_ORIGIN
  });
  const directory=process.env.ORCA_SECRETS_DIR;
  if(typeof directory!=='string'||!isAbsolute(directory)||
     directory==='/'||directory.includes('\0'))
    throw Error('invalid_operator_secret_directory');
  const real=realpathSync(directory);
  const key=join(real,'key.pem');
  const cert=join(real,'cert.pem');
  const keyInfo=lstatSync(key);
  const certInfo=lstatSync(cert);
  if(!keyInfo.isFile()||!certInfo.isFile()||
     (keyInfo.mode&0o007)!==0||
     keyInfo.size<100||keyInfo.size>8192||
     certInfo.size<100||certInfo.size>32768)
    throw Error('unsafe_operator_tls_secret_files');
  const output=inspectLockedDeploymentTls({
    certificatePem:readFileSync(cert,'utf8'),
    privateKeyPem:readFileSync(key,'utf8'),
    hostname:new URL(targets.resource).hostname
  });
  console.log(JSON.stringify(output,null,2));
}catch{
  console.error('BLOCKED: check approved hostname, private TLS key/certificate match, SAN and >=14-day expiry; no credentials belong in chat.');
  process.exitCode=1;
}
