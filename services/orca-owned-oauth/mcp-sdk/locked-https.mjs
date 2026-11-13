// Stage 14 — directly terminated HTTPS staging shell, DISABLED by design.
// This module only starts a network server when explicitly invoked. It
// cannot approve OAuth clients, mint tokens, or read Supabase research data.
// Future activation requires a different, separately reviewed entry point.
import {createServer} from 'node:https';
import {createOrcaMcpNodeIngress} from './node-ingress.mjs';
import {createOrcaSdkMcpGateway} from './secure-handler.mjs';

function exactOrigin(value){
  if(typeof value!=='string')throw Error('stage14_https_origin_required');
  const u=new URL(value);
  if(u.protocol!=='https:'||u.origin!==value||
     u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw Error('stage14_https_origin_required');
  return u;
}
function exactResource(value,origin){
  if(typeof value!=='string')throw Error('stage14_mcp_resource_required');
  const u=new URL(value);
  if(u.href!==value||u.origin!==origin.origin||u.pathname!=='/mcp'||
    u.search||u.hash)throw Error('stage14_mcp_resource_required');
  return u.href;
}
function noRelease(options){
  if(options?.mcpEnabled!==false||options?.issuerEnabled!==false)
    throw Error('stage14_release_must_remain_disabled');
}
function reply(res,status,body){
  if(res.headersSent||res.writableEnded)return;
  const bytes=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'content-length':bytes.length,
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'",
    'referrer-policy':'no-referrer'
  });
  res.end(bytes);
}
/**
 * Creates a real HTTPS socket listener object, but DOES NOT listen by itself.
 * Private key and certificate are provided by the operator's secret mount.
 * No use of X-Forwarded-* is allowed, and no untrusted proxy callback.
 */
export function createLockedStagingHttpsServer({
  tlsKey,tlsCertificate,issuerOrigin,mcpResource,
  mcpEnabled=false,issuerEnabled=false
}={}){
  noRelease({mcpEnabled,issuerEnabled});
  if(typeof tlsKey!=='string'||!tlsKey.includes('PRIVATE KEY-----')||
     typeof tlsCertificate!=='string'||!tlsCertificate.includes('CERTIFICATE-----'))
    throw Error('stage14_tls_material_required');
  const resourceOrigin=exactOrigin(new URL(mcpResource).origin);
  const resource=exactResource(mcpResource,resourceOrigin);
  const issuer=exactOrigin(issuerOrigin);
  if(issuer.origin===resourceOrigin.origin)
    throw Error('stage14_separate_issuer_origin_required');
  const metadata=resourceOrigin.origin+'/.well-known/oauth-protected-resource/mcp';
  const gateway=createOrcaSdkMcpGateway({
    issuer:issuer.origin,resource,metadataUrl:metadata,
    advertised:false,enabled:false
  });
  const ingress=createOrcaMcpNodeIngress({
    gateway,publicOrigin:resourceOrigin.origin,enabled:false
  });
  return createServer({
    key:tlsKey,cert:tlsCertificate,
    minVersion:'TLSv1.2',
    maxHeaderSize:8192,
    requestTimeout:15000,
    headersTimeout:10000
  },(req,res)=>{
    if(req.url==='/healthz'&&req.method==='GET'&&
       req.socket?.encrypted===true&&
       req.headers.host===resourceOrigin.host&&
       !req.headers.origin&&!req.headers.cookie){
      // Liveness ONLY, never indicates production readiness.
      reply(res,200,{service:'orca-mcp-staging',status:'locked'});
      return;
    }
    ingress(req,res);
  });
}
