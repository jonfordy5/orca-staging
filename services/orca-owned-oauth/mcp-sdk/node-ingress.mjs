// ORCA Stage 13: private Node HTTP ingress for the official MCP SDK.
// CODE ONLY. No listen(), deployment, real OAuth grant or credentials.
// Deployment must terminate real TLS at a controlled ingress. The default
// trust check requires an actual TLS socket, NOT X-Forwarded-* headers.
// A reverse proxy may inject a separately audited trust callback only when
// this server is unreachable except through that authenticated proxy.
import {createServer} from 'node:http';

const BODY_LIMIT=16*1024;
const RESPONSE_LIMIT=128*1024;
const OUTPUT_HEADERS=new Set([
  'content-type','cache-control','www-authenticate',
  'mcp-session-id','mcp-protocol-version','vary','retry-after'
]);
const REJECT_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'",
  'cross-origin-resource-policy':'same-origin'
};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

function parsedOrigin(value){
  if(typeof value!=='string')throw Error('https_ingress_origin_required');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.origin!==value||
     url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('https_ingress_origin_required');
  return url;
}
function respond(res,status,body){
  if(res.headersSent||res.writableEnded)return;
  const content=Buffer.from(JSON.stringify({error:body}));
  res.writeHead(status,{...REJECT_HEADERS,'content-length':content.length});
  res.end(content);
}
function acceptedPath(url){
  return typeof url==='string'&&url.startsWith('/')&&
    !url.includes('?')&&!url.includes('#')&&
    !url.includes('%')&&!url.includes('//')&&url.length<=256;
}
async function requestBody(req,limit){
  const size=req.headers['content-length'];
  if(size!==undefined&&(!/^\d+$/.test(size)||Number(size)>limit))
    throw Error('body_too_large');
  const chunks=[];let length=0;
  for await(const chunk of req){
    length+=chunk.length;
    if(length>limit)throw Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function outputBody(response,limit){
  const reader=response.body?.getReader();
  if(!reader)return Buffer.alloc(0);
  const chunks=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>limit)throw Error('sdk_response_too_large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }finally{
    if(length>limit){
      try{await reader.cancel();}catch{}
    }
    reader.releaseLock();
  }
}

/**
 * Requires the *already validated* Stage 12 gateway or an equivalent
 * audited handler. This adapter does not instantiate OAuth, read database
 * secrets, modify assignments, or provide a public default.
 *
 * - enabled=false: all requests 503, even when gateway is configured.
 * - isTrustedIngress defaults to req.socket.encrypted === true. Never set
 *   true because a client sent X-Forwarded-Proto, Forwarded or another header.
 * - A reverse proxy must authenticate its backend link and strip forwarded
 *   headers, enforce its own body cap, TLS, rate limits and request timeout.
 */
export function createOrcaMcpNodeIngress({
  gateway,publicOrigin,enabled=false,
  isTrustedIngress=req=>req.socket?.encrypted===true,
  maxBodyBytes=BODY_LIMIT,maxResponseBytes=RESPONSE_LIMIT
}={}){
  const origin=parsedOrigin(publicOrigin);
  if(typeof gateway?.fetch!=='function'||
     typeof isTrustedIngress!=='function'||
     !Number.isInteger(maxBodyBytes)||maxBodyBytes<1024||
     maxBodyBytes>BODY_LIMIT||
     !Number.isInteger(maxResponseBytes)||maxResponseBytes<16384||
     maxResponseBytes>RESPONSE_LIMIT)
    throw Error('verified_https_mcp_ingress_configuration_required');
  return async function handle(req,res){
    if(!enabled){respond(res,503,'orca_mcp_not_deployed');return;}
    if(!isObj(req?.headers)||isTrustedIngress(req)!==true){
      respond(res,403,'secure_ingress_required');return;
    }
    if(req.headers.host!==origin.host){
      respond(res,421,'unapproved_request_host');return;
    }
    if(req.headers.origin||req.headers.cookie||
       req.headers['x-http-method-override']){
      respond(res,403,'browser_or_proxy_request_denied');return;
    }
    if(!acceptedPath(req.url)){
      respond(res,404,'not_found');return;
    }
    if(req.method!=='GET'&&req.method!=='POST'){
      respond(res,405,'method_not_allowed');return;
    }
    // Do not echo the request Host, Forwarded or absolute URL. Both the
    // gateway and the authorization verifier see a fixed HTTPS origin.
    const headers=new Headers();
    for(const [name,value] of Object.entries(req.headers)){
      if(typeof value!=='string')continue;
      if(['host','connection','transfer-encoding','content-length',
        'x-forwarded-proto','x-forwarded-host','x-forwarded-for',
        'forwarded','cookie','origin'].includes(name))continue;
      headers.set(name,value);
    }
    let body;
    try{
      body=req.method==='POST'?await requestBody(req,maxBodyBytes):undefined;
    }catch{
      respond(res,413,'request_too_large');return;
    }
    try{
      const target=new Request(origin.origin+req.url,{
        method:req.method,headers,
        ...(body?{body}:null)
      });
      const response=await gateway.fetch(target);
      if(!(response instanceof Response))throw Error('bad_sdk_response');
      const payload=await outputBody(response,maxResponseBytes);
      if(res.headersSent||res.writableEnded)return;
      const out={...REJECT_HEADERS};
      for(const [key,value] of response.headers){
        if(OUTPUT_HEADERS.has(key))out[key]=value;
      }
      out['content-length']=payload.byteLength;
      res.writeHead(response.status,out);
      res.end(payload);
    }catch{
      respond(res,503,'mcp_gateway_unavailable');
    }
  };
}

/** Creates a Node HTTP server but DOES NOT bind a port or start listening. */
export function createOrcaMcpNodeServer(options){
  return createServer({
    maxHeaderSize:8192,
    requestTimeout:15000,
    headersTimeout:10000
  },createOrcaMcpNodeIngress(options));
}
