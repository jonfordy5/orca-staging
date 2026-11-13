// ORCA Stage 12 — official MCP TypeScript SDK v2 serving adapter.
// CODE ONLY; NO public listener, no live OAuth activation, no DB migration.
// This wrapper authenticates every POST and checks the current private ORCA
// consent grant BEFORE creating a new MCP SDK request handler. No Supabase
// login token or ORCA agent bearer is sent to the database.
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  authorizeOwnedMcpRequest,makeProtectedResourceMetadata
} from '../mcp-resource-policy.mjs';
import {createOwnerScopedResearchDispatcher} from
  '../read-only-research-dispatcher.mjs';

const READ_SCOPE='orca:research.read';
const MAX_BODY=16*1024;
const JSON_HEADERS=Object.freeze({
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'cross-origin-resource-policy':'same-origin'
});
const TICKER=z.string().regex(/^[A-Za-z][A-Za-z0-9.]{0,9}$/).optional();
const fail=reason=>{throw Error(reason);};
function exactHttps(value){
  if(typeof value!=='string')return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&
      !url.search&&!url.hash&&url.href===value;
  }catch{return false;}
}
function canonicalMetadata(resource){
  const url=new URL(resource);
  return url.origin+'/.well-known/oauth-protected-resource'+
    (url.pathname==='/'?'':url.pathname);
}
function json(status,body,extra={}){
  return new Response(JSON.stringify(body),{
    status,headers:{...JSON_HEADERS,'content-type':'application/json',...extra}
  });
}
async function callExistingRead(dispatcher,identity,name,args){
  // The existing read dispatcher is our single research-query implementation.
  // The SDK owns tool schema checks and protocol wire-format. Only the
  // token-verified identity reaches the dispatcher; raw auth headers do not.
  try{
    const output=await dispatcher({
      rpc:{jsonrpc:'2.0',id:1,method:'tools/call',
        params:{name,arguments:args}},
      ownerId:identity.ownerId,
      clientId:identity.clientId,
      grantId:identity.grantId
    });
    if(!(output instanceof Response)||output.status!==200)
      fail('read_only_dispatch_failed');
    const payload=await output.json();
    const tool=payload?.result;
    if(!Array.isArray(tool?.content)||
       tool.content.length!==1||
       tool.content[0]?.type!=='text'||
       typeof tool.content[0].text!=='string'||
       tool.content[0].text.length>8192)
      fail('unexpected_read_only_result');
    return {content:tool.content,isError:false};
  }catch{
    return {content:[{type:'text',text:'ORCA read-only research temporarily unavailable.'}],
      isError:true};
  }
}
function mcpServer(dispatcher,identity){
  const server=new McpServer({
    name:'orca-research-readonly',
    version:'0.1.0-staging'
  },{capabilities:{tools:{listChanged:false}}});
  const annotations={
    readOnlyHint:true,destructiveHint:false,
    idempotentHint:true,openWorldHint:false
  };
  server.registerTool('orca_whoami',{
    title:'My ORCA researcher',
    description:'Read your existing ORCA researcher identity and opt-in status. No profile creation or updates.',
    annotations,
    inputSchema:z.object({}).strict()
  },async()=>callExistingRead(dispatcher,identity,'orca_whoami',{}));
  server.registerTool('orca_my_assignment',{
    title:'My ORCA research assignment',
    description:'Read your current claimed research assignment without claiming or publishing anything.',
    annotations,
    inputSchema:z.object({ticker:TICKER}).strict()
  },async args=>callExistingRead(dispatcher,identity,'orca_my_assignment',args));
  return server;
}

/**
 * query: a Stage 10 allowlisted, owner-scoped, read-only PostgreSQL adapter.
 * verifierOptions: pinned ES256 public key, exact approved client set, and
 * a fresh isCurrentGrant lookup. Never use a Supabase service-role client.
 * Off by default, even when metadata has been prepared.
 */
export function createOrcaSdkMcpGateway({
  issuer,resource,metadataUrl,advertised=false,enabled=false,
  verifierOptions,query
}={}){
  if(!exactHttps(issuer)||!exactHttps(resource)||
     !exactHttps(metadataUrl)||metadataUrl!==canonicalMetadata(resource)||
     issuer===resource||
     (enabled&&(
       typeof query!=='function'||
       typeof verifierOptions?.currentGrant!=='function'||
       !(verifierOptions?.approvedClientIds instanceof Set)||
       !verifierOptions?.publicKey)))
    throw Error('verified_orca_mcp_sdk_configuration_required');
  const resourceMetadata=makeProtectedResourceMetadata({issuer,resource});
  const dispatcher=enabled?createOwnerScopedResearchDispatcher({query}):null;
  return Object.freeze({
    async fetch(request){
      if(!(request instanceof Request))
        return json(400,{error:'invalid_request'});
      if(request.url===metadataUrl&&request.method==='GET')
        return advertised?json(200,resourceMetadata):
          json(404,{error:'not_found'});
      if(request.url!==resource)return json(404,{error:'not_found'});
      if(!enabled)return json(503,{error:'mcp_not_enabled'});
      if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
      // MCP is server-to-server. Reject browser-sourced cross-origin POSTs.
      if(request.headers.has('origin')||
         (request.headers.has('host')&&
           request.headers.get('host')!==new URL(resource).host))
        return json(403,{error:'request_origin_unapproved'});
      const checked=await authorizeOwnedMcpRequest(request,{
        ...verifierOptions,issuer,resource
      });
      if(!checked.ok)
        return json(401,{error:'authorization_required'},{
          'www-authenticate':'Bearer resource_metadata="'+metadataUrl+
            '", scope="'+READ_SCOPE+'"'
        });
      const claimed=Number(request.headers.get('content-length'));
      if(request.headers.has('content-length')&&
         (!Number.isSafeInteger(claimed)||claimed<0||claimed>MAX_BODY))
        return json(413,{error:'request_too_large'});
      // SDK owns JSON-RPC, protocol/version negotiation, 2025 stateless
      // compatibility, 2026 per-request envelope, and tool schema checks.
      const handler=createMcpHandler(
        ()=>mcpServer(dispatcher,checked),
        {legacy:'stateless',responseMode:'json',maxRequestBodySize:MAX_BODY}
      );
      try{
        // No authInfo bearer or untrusted user ID passed; tool closure holds
        // only verified owner/client/current grant information.
        return await handler.fetch(request);
      }finally{
        await handler.close();
      }
    }
  });
}
