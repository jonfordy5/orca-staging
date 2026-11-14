#!/usr/bin/env node
// Operator-only, unauthenticated and READ-ONLY. Do not pass bearer tokens.
// No hostname is invented; supply the approved public MCP and issuer URLs.
// Trust of system TLS roots must remain ON for actual public host checks.
import {runDeploymentPreflight} from './deployment-preflight.mjs';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--mode'||
   !['locked','oauth-discovery'].includes(args[1])){
  console.error('Usage: node deployment-preflight.cli.mjs --mode locked|oauth-discovery');
  process.exitCode=2;
}else if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'){
  console.error('BLOCKED: TLS certificate verification must remain enabled.');
  process.exitCode=2;
}else{
  try{
    const result=await runDeploymentPreflight({
      mode:args[1],
      resource:process.env.ORCA_MCP_RESOURCE,
      issuer:process.env.ORCA_ISSUER_ORIGIN
    });
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.status==='passed'?0:1;
  }catch{
    console.error('BLOCKED: supply separate, operator-approved public HTTPS ORCA_MCP_RESOURCE and ORCA_ISSUER_ORIGIN values.');
    process.exitCode=2;
  }
}
