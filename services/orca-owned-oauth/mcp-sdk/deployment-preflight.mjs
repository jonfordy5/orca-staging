// ORCA Stage 15 — public HTTPS deployment preflight (READ-ONLY).
// Explicitly run by an operator on an approved host. It never obtains OAuth
// tokens, signs a user in, changes a database, or enables the MCP release.
// Node's default HTTPS certificate validation remains enabled. Never use
// NODE_TLS_REJECT_UNAUTHORIZED=0 in a real deployment check.
import {isIP} from 'node:net';

const SCOPE='orca:research.read';
const MAX_JSON_BYTES=16384;
const VALID_MODES=new Set(['locked','oauth-discovery']);
const NONPUBLIC_SUFFIXES=[
  '.local','.localhost','.internal','.invalid','.test','.example',
  '.example.com','.example.net','.example.org'
];
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

function fail(message){throw Error(message);}
function publicHttpsUrl(value,{root=false,path}={}){
  if(typeof value!=='string')fail('public_https_url_required');
  let url;
  try{url=new URL(value);}catch{fail('public_https_url_required');}
  if(url.protocol!=='https:'||url.port||url.username||url.password||
     url.search||url.hash||url.hostname!==url.hostname.toLowerCase()||
     url.hostname.endsWith('.')||url.hostname.indexOf('.')<1||
     url.hostname.length>253||url.hostname.startsWith('-')||
     !/^[a-z0-9.-]+$/.test(url.hostname)||isIP(url.hostname)||
     NONPUBLIC_SUFFIXES.some(s=>url.hostname.endsWith(s))||
     ['localhost','example.com','example.net','example.org'].includes(url.hostname)||
     (root?value!==url.origin:value!==url.href||url.pathname!==path))
    fail('approved_public_https_hostname_required');
  return url;
}
export function validateDeploymentTargets({resource,issuer}={}){
  const target=publicHttpsUrl(resource,{path:'/mcp'});
  const authorization=publicHttpsUrl(issuer,{root:true});
  if(target.origin===authorization.origin)
    fail('separate_https_issuer_origin_required');
  return Object.freeze({
    resource:target.href,
    issuer:authorization.origin,
    mcpOrigin:target.origin,
    metadataUrl:target.origin+'/.well-known/oauth-protected-resource/mcp',
    issuerMetadataUrl:authorization.origin+'/.well-known/oauth-authorization-server'
  });
}
function check(name,ok,detail){
  return Object.freeze({name,passed:ok===true,
    detail:typeof detail==='string'?detail:(ok?'verified':'rejected')});
}
async function probe(fetchImpl,url,{method='GET',body,limit=MAX_JSON_BYTES}={}){
  const headers={
    'accept':'application/json',
    ...(method==='POST'?{'content-type':'application/json'}:{})
  };
  const response=await fetchImpl(url,{
    method,headers,...(body?{body:JSON.stringify(body)}:{}),
    redirect:'manual',signal:AbortSignal.timeout(6500),
    cache:'no-store'
  });
  if(!(response instanceof Response))fail('invalid_network_response');
  if(response.status>=300&&response.status<400)
    fail('redirect_not_permitted');
  const contentLength=response.headers.get('content-length');
  if(contentLength!==null&&(!/^\d+$/.test(contentLength)||
       Number(contentLength)>limit))
    fail('unexpected_response_size');
  const stream=response.body?.getReader();
  let bytes=0;
  const chunks=[];
  if(stream){
    try{
      while(true){
        const {done,value}=await stream.read();
        if(done)break;
        bytes+=value.byteLength;
        if(bytes>limit)fail('unexpected_response_size');
        chunks.push(value);
      }
    }finally{
      if(bytes>limit){try{await stream.cancel();}catch{}}
      stream.releaseLock();
    }
  }
  const buffer=new Uint8Array(bytes);let offset=0;
  for(const part of chunks){buffer.set(part,offset);offset+=part.byteLength;}
  return {
    status:response.status,
    headers:response.headers,
    text:new TextDecoder('utf-8',{fatal:true}).decode(buffer)
  };
}
function jsonBody(response){
  if(!/^application\/json(?:\s*;|$)/i.test(
      response.headers.get('content-type')||''))
    fail('unexpected_response_content_type');
  try{
    const data=JSON.parse(response.text);
    if(!isObj(data))fail('invalid_json_object');
    return data;
  }catch{fail('invalid_json_object');}
}
function httpsOnOrigin(url,origin){
  const parsed=publicHttpsUrl(url,{path:new URL(url).pathname});
  return parsed.origin===origin&&
    parsed.pathname!=='/'&&
    parsed.search===''&&parsed.hash==='';
}
async function runOne(checks,name,fn){
  try{
    const detail=await fn();
    checks.push(check(name,true,detail));
  }catch(error){
    // No raw server responses, query strings, authorization headers or
    // secret material can enter the operator output.
    const safe=String(error?.message||'preflight_check_failed');
    const known=new Set([
      'redirect_not_permitted','unexpected_response_size',
      'invalid_json_object','unexpected_response_content_type',
      'invalid_network_response','discovery_mismatch',
      'invalid_locked_response','unexpected_mcp_exposure',
      'wrong_auth_challenge','invalid_issuer_metadata',
      'invalid_public_jwks'
    ]);
    checks.push(check(name,false,known.has(safe)?safe:'network_or_endpoint_unavailable'));
  }
}

/**
 * Use the injected fetch only in offline unit tests. In operator mode the
 * default platform fetch validates the real public TLS certificate and host.
 * This preflight does not audit DNS provenance, firewall, private database
 * roles, OAuth consent or real user access. Passing it is NOT launch approval.
 */
export async function runDeploymentPreflight({
  resource,issuer,mode='locked',fetchImpl=fetch
}={}){
  if(!VALID_MODES.has(mode)||typeof fetchImpl!=='function')
    fail('deployment_preflight_mode_required');
  const target=validateDeploymentTargets({resource,issuer});
  const checks=[];
  if(mode==='locked'){
    await runOne(checks,'locked_https_health',async()=>{
      const response=await probe(fetchImpl,target.mcpOrigin+'/healthz',{limit:2048});
      const data=jsonBody(response);
      if(response.status!==200||
         data.service!=='orca-mcp-staging'||data.status!=='locked'||
         response.headers.get('cache-control')!=='no-store')
        fail('invalid_locked_response');
      return 'TLS health returned locked; does not prove issuer readiness';
    });
    await runOne(checks,'locked_mcp_denied',async()=>{
      const response=await probe(fetchImpl,target.resource,{
        method:'POST',body:{jsonrpc:'2.0',id:1,method:'tools/list'}
      });
      if(response.status!==503)fail('unexpected_mcp_exposure');
      return 'MCP POST denied while release is OFF';
    });
    await runOne(checks,'locked_discovery_denied',async()=>{
      const response=await probe(fetchImpl,target.metadataUrl);
      if(response.status!==503)fail('unexpected_mcp_exposure');
      return 'protected-resource discovery unavailable while locked';
    });
  }else{
    let jwksUrl=null;
    await runOne(checks,'resource_discovery',async()=>{
      const response=await probe(fetchImpl,target.metadataUrl);
      const data=jsonBody(response);
      if(response.status!==200||data.resource!==target.resource||
         !Array.isArray(data.authorization_servers)||
         data.authorization_servers.length!==1||
         data.authorization_servers[0]!==target.issuer||
         !Array.isArray(data.scopes_supported)||
         data.scopes_supported.length!==1||
         data.scopes_supported[0]!==SCOPE||
         !Array.isArray(data.bearer_methods_supported)||
         !data.bearer_methods_supported.includes('header'))
        fail('discovery_mismatch');
      return 'exact read-only resource, issuer and scope advertised';
    });
    await runOne(checks,'unauthenticated_mcp_challenge',async()=>{
      const response=await probe(fetchImpl,target.resource,{
        method:'POST',body:{jsonrpc:'2.0',id:1,method:'tools/list'}
      });
      const challenge=response.headers.get('www-authenticate')||'';
      if(response.status!==401||
         challenge!=='Bearer resource_metadata="'+target.metadataUrl+
           '", scope="'+SCOPE+'"')
        fail('wrong_auth_challenge');
      return 'unauthenticated MCP request rejected with exact metadata URL';
    });
    await runOne(checks,'issuer_discovery',async()=>{
      const response=await probe(fetchImpl,target.issuerMetadataUrl);
      const doc=jsonBody(response);
      if(response.status!==200||doc.issuer!==target.issuer||
         !Array.isArray(doc.code_challenge_methods_supported)||
         !doc.code_challenge_methods_supported.includes('S256')||
         !Array.isArray(doc.response_types_supported)||
         !doc.response_types_supported.includes('code')||
         !Array.isArray(doc.grant_types_supported)||
         !doc.grant_types_supported.includes('authorization_code')||
         !httpsOnOrigin(doc.authorization_endpoint,target.issuer)||
         !httpsOnOrigin(doc.token_endpoint,target.issuer)||
         !httpsOnOrigin(doc.jwks_uri,target.issuer))
        fail('invalid_issuer_metadata');
      jwksUrl=doc.jwks_uri;
      return 'issuer endpoints, PKCE S256 and authorization-code metadata verified';
    });
    await runOne(checks,'public_signing_keys',async()=>{
      if(!jwksUrl)fail('invalid_issuer_metadata');
      const response=await probe(fetchImpl,jwksUrl);
      const data=jsonBody(response);
      if(response.status!==200||!Array.isArray(data.keys)||
         data.keys.length<1||data.keys.length>4)
        fail('invalid_public_jwks');
      const kids=new Set();
      for(const key of data.keys){
        if(!isObj(key)||key.kty!=='EC'||key.crv!=='P-256'||
           (key.alg!==undefined&&key.alg!=='ES256')||
           (key.use!==undefined&&key.use!=='sig')||
           (key.key_ops!==undefined&&(!Array.isArray(key.key_ops)||
             key.key_ops.length!==1||key.key_ops[0]!=='verify'))||
           typeof key.kid!=='string'||
           !/^[A-Za-z0-9_-]{8,128}$/.test(key.kid)||kids.has(key.kid)||
           typeof key.x!=='string'||typeof key.y!=='string'||
           !/^[A-Za-z0-9_-]{43}$/.test(key.x)||
           !/^[A-Za-z0-9_-]{43}$/.test(key.y)||
           Buffer.from(key.x,'base64url').toString('base64url')!==key.x||
           Buffer.from(key.y,'base64url').toString('base64url')!==key.y||
           ['d','p','q','dp','dq','qi','k'].some(name=>
             Object.hasOwn(key,name)))
          fail('invalid_public_jwks');
        kids.add(key.kid);
      }
      return 'public ES256 signing keys published without private material';
    });
  }
  const passed=checks.every(c=>c.passed);
  return Object.freeze({
    status:passed?'passed':'blocked',
    mode,
    publicDeploymentAuthorized:false,
    resource:target.resource,
    issuer:target.issuer,
    checks,
    next:mode==='locked'
      ?'Host certificate/DNS and run separately reviewed real issuer deployment; release OFF.'
      :'Verify human consent, registered ChatGPT callback, private roles, and two live researcher accounts before release.'
  });
}
