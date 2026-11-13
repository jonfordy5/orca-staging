// ORCA-owned OAuth Stage 8: separate, authenticated MCP admission adapter.
// CODE ONLY: NO deployed MCP function, SDK initialization or listener.
// Only an independently audited MCP SDK dispatcher may be plugged in.
// This never forwards an ORCA OAuth bearer to Supabase Auth/Data API.
import {
  authorizeOwnedMcpRequest,makeProtectedResourceMetadata
} from './mcp-resource-policy.mjs';

const READ_SCOPE='orca:research.read';
const BODY_MAX=16*1024;
const TOOLS=new Set(['orca_whoami','orca_my_assignment']);
const METHODS=new Set([
  'initialize','notifications/initialized','ping','tools/list','tools/call'
]);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const JSON_HEADERS={
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'cross-origin-resource-policy':'same-origin'
};
function exactHttps(value){
  try{
    const u=new URL(value);
    return typeof value==='string'&&u.protocol==='https:'&&
      !u.username&&!u.password&&!u.search&&!u.hash&&
      u.href===value;
  }catch{return false;}
}
function respond(body,status,more={}){
  return new Response(body,{
    status,headers:{...JSON_HEADERS,'content-type':'application/json',...more}
  });
}
function challenge(metadataUrl){
  return {
    ...JSON_HEADERS,
    'content-type':'application/json',
    'www-authenticate':'Bearer resource_metadata="'+metadataUrl+
      '", scope="'+READ_SCOPE+'"'
  };
}
async function parseLimitedJson(request){
  const advertised=request.headers.get('content-length');
  if(advertised!==null&&(!/^\d+$/.test(advertised)||Number(advertised)>BODY_MAX))
    throw Error('oversized_mcp_request');
  const reader=request.body?.getReader();
  if(!reader)throw Error('empty_mcp_request');
  const chunks=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>BODY_MAX)throw Error('oversized_mcp_request');
      chunks.push(value);
    }
  }catch(error){
    try{await reader.cancel();}catch{}
    throw error;
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!isObj(value)||value.jsonrpc!=='2.0'||
     typeof value.method!=='string'||!METHODS.has(value.method))
    throw Error('unapproved_mcp_method');
  if(value.method==='tools/call'){
    if(!isObj(value.params)||!TOOLS.has(value.params.name)||
       (value.params.arguments!==undefined&&!isObj(value.params.arguments)))
      throw Error('unapproved_mcp_tool');
  }
  if(value.method==='notifications/initialized'&&Object.hasOwn(value,'id'))
    throw Error('invalid_mcp_notification');
  return value;
}

/**
 * No network operations or JWT issuance. Default flags are OFF.
 * - advertised=true permits public metadata discovery only.
 * - enabled=true additionally requires an audited read-only SDK dispatch
 *   and real private grant lookup with an approved client.
 * The actual deployer must hold the signing public key and ensure its
 * owner-scoped read implementation cannot perform writes.
 */
export function createOwnedMcpAdmission({
  issuer,resource,metadataUrl,advertised=false,enabled=false,
  verifierOptions,dispatchReadOnly
}={}){
  if(!exactHttps(issuer)||!exactHttps(resource)||
     !exactHttps(metadataUrl)||
     new URL(metadataUrl).origin!==new URL(resource).origin||
     issuer===resource||resource===metadataUrl||
     (enabled&&(typeof dispatchReadOnly!=='function'||
       typeof verifierOptions?.currentGrant!=='function')))
    throw Error('unvetted_mcp_admission_configuration');
  const metadata=makeProtectedResourceMetadata({issuer,resource});
  return async function admit(request){
    if(!(request instanceof Request))return respond(
      JSON.stringify({error:'invalid_request'}),400);
    const url=request.url;
    if(url===metadataUrl&&request.method==='GET'){
      if(!advertised)return respond(JSON.stringify({error:'not_found'}),404);
      return respond(JSON.stringify(metadata),200);
    }
    if(url!==resource||request.method!=='POST')
      return respond(JSON.stringify({error:'not_found'}),404);
    if(!enabled)
      return respond(JSON.stringify({error:'mcp_not_enabled'}),503);
    const checked=await authorizeOwnedMcpRequest(request,{
      ...verifierOptions,issuer,resource
    });
    if(!checked.ok)
      return new Response(JSON.stringify({error:'authorization_required'}),{
        status:401,headers:challenge(metadataUrl)
      });
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('content-type')||''))
      return respond(JSON.stringify({error:'unsupported_content_type'}),415);
    let rpc;
    try{
      rpc=await parseLimitedJson(request);
    }catch{
      return respond(JSON.stringify({error:'invalid_or_forbidden_mcp_request'}),400);
    }
    // Important: only the validated owner/client/grant and bounded JSON
    // reach the trusted dispatcher; the raw bearer is never passed through.
    try{
      const output=await dispatchReadOnly({
        rpc,ownerId:checked.ownerId,
        clientId:checked.clientId,grantId:checked.grantId
      });
      if(!(output instanceof Response))
        throw Error('trusted_mcp_dispatcher_unavailable');
      return output;
    }catch{
      return respond(JSON.stringify({error:'read_only_tool_unavailable'}),503);
    }
  };
}
