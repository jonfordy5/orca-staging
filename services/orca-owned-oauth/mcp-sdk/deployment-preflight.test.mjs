import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runDeploymentPreflight,validateDeploymentTargets} from './deployment-preflight.mjs';

const resource='https://mcp.orca-staging.net/mcp';
const issuer='https://auth.orca-staging.net';
const meta='https://mcp.orca-staging.net/.well-known/oauth-protected-resource/mcp';
const issuerMeta=issuer+'/.well-known/oauth-authorization-server';
const json=(status,value,extra={})=>
  new Response(JSON.stringify(value),{
    status,headers:{'content-type':'application/json',
      'cache-control':'no-store',...extra}
  });
function fixture(mode='locked'){
  const requests=[];
  let corrupt='',network=false;
  const fetchImpl=async(url,options)=>{
    requests.push({url,method:options.method,redirect:options.redirect,
      headers:options.headers,body:options.body});
    if(network)throw Error('private network or invalid TLS');
    if(corrupt==='redirect'&&url.endsWith('/healthz'))
      return new Response(null,{status:302,headers:{location:'https://evil.example.invalid'}});
    if(mode==='locked'){
      if(url===resource.replace('/mcp','/healthz')){
        return json(200,corrupt==='health'?
          {service:'orca-mcp-staging',status:'ready'}:
          {service:'orca-mcp-staging',status:'locked'});
      }
      if(url===resource||url===meta){
        return json(corrupt==='exposure'?200:503,{error:'orca_mcp_not_deployed'});
      }
    }else{
      if(url===meta)
        return json(200,{
          resource,authorization_servers:corrupt==='issuer'?
            ['https://evil.orca-staging.net']:[issuer],
          scopes_supported:corrupt==='write'?
            ['orca:research.read','orca:research.write']:['orca:research.read'],
          bearer_methods_supported:['header']
        });
      if(url===resource)
        return json(corrupt==='challenge'?200:401,
          {error:'authorization_required'},{
            'www-authenticate':'Bearer resource_metadata="'+meta+
              '", scope="orca:research.read"'
          });
      if(url===issuerMeta)
        return json(200,{
          issuer,authorization_endpoint:issuer+'/auth',
          token_endpoint:corrupt==='token'?
            'https://evil.orca-staging.net/token':issuer+'/token',
          jwks_uri:issuer+'/jwks',
          code_challenge_methods_supported:corrupt==='pkce'?['plain']:['S256'],
          response_types_supported:['code'],
          grant_types_supported:['authorization_code']
        });
    }
    throw Error('unexpected request');
  };
  return {fetchImpl,requests,corrupt:x=>corrupt=x,network:x=>network=x};
}
test('reject HTTP, IP, loopback, reserved hostnames, query credentials and same-origin issuer',()=>{
  const invalidResources=[
    'http://mcp.orca-staging.net/mcp',
    'https://127.0.0.1/mcp','https://localhost/mcp',
    'https://mcp.example.invalid/mcp',
    'https://mcp.orca-staging.net/mcp?token=secret',
    'https://alice:password@mcp.orca-staging.net/mcp',
    'https://mcp.orca-staging.net/other',
    'https://mcp.orca-staging.net:8443/mcp',
    'https://mcp.orca-staging.net/mcp#frag'
  ];
  for(const candidate of invalidResources)
    assert.throws(()=>validateDeploymentTargets({
      resource:candidate,issuer
    }));
  assert.throws(()=>validateDeploymentTargets({
    resource,issuer:'https://mcp.orca-staging.net'
  }),/separate_https_issuer_origin_required/);
});
test('locked host: verify exact HTTPS health and both MCP routes CLOSED',async()=>{
  const f=fixture();
  const out=await runDeploymentPreflight({
    resource,issuer,mode:'locked',fetchImpl:f.fetchImpl
  });
  assert.equal(out.status,'passed');
  assert.equal(out.publicDeploymentAuthorized,false);
  assert.deepEqual(out.checks.map(x=>x.name),[
    'locked_https_health','locked_mcp_denied','locked_discovery_denied'
  ]);
  assert.ok(out.checks.every(x=>x.passed));
  assert.deepEqual(f.requests.map(x=>[x.url,x.method]),[
    [resource.replace('/mcp','/healthz'),'GET'],
    [resource,'POST'],
    [meta,'GET']
  ]);
  assert.ok(f.requests.every(x=>x.redirect==='manual'));
  assert.ok(f.requests.every(x=>!Object.hasOwn(x.headers,'authorization')));
});
test('fail CLOSED on accidental exposure, false health, redirect or network failure',async()=>{
  for(const bad of ['health','exposure','redirect']){
    const f=fixture();f.corrupt(bad);
    const out=await runDeploymentPreflight({
      resource,issuer,mode:'locked',fetchImpl:f.fetchImpl
    });
    assert.equal(out.status,'blocked',bad);
    assert.ok(out.checks.some(x=>!x.passed));
  }
  const f=fixture();f.network(true);
  const out=await runDeploymentPreflight({
    resource,issuer,mode:'locked',fetchImpl:f.fetchImpl
  });
  assert.equal(out.status,'blocked');
  assert.ok(out.checks.every(x=>!x.passed));
  assert.ok(out.checks.every(x=>x.detail==='network_or_endpoint_unavailable'));
});
test('OAuth discovery: exact read scope, issuer, PKCE and resource challenge',async()=>{
  const f=fixture('oauth');
  const out=await runDeploymentPreflight({
    resource,issuer,mode:'oauth-discovery',fetchImpl:f.fetchImpl
  });
  assert.equal(out.status,'passed');
  assert.equal(out.publicDeploymentAuthorized,false,
    'OAuth metadata alone cannot authorize public deployment');
  assert.ok(out.checks.every(x=>x.passed));
  assert.deepEqual(f.requests.map(x=>x.url),[meta,resource,issuerMeta]);
});
test('OAuth preflight denies write scope, wrong issuer, bad challenge, PKCE or cross-origin endpoints',async()=>{
  for(const issue of ['write','issuer','challenge','pkce','token']){
    const f=fixture('oauth');f.corrupt(issue);
    const out=await runDeploymentPreflight({
      resource,issuer,mode:'oauth-discovery',fetchImpl:f.fetchImpl
    });
    assert.equal(out.status,'blocked',issue);
    assert.ok(out.checks.some(x=>!x.passed));
  }
});
test('CLI refuses disabled TLS verification and missing approved host, no network access',()=>{
  const run=env=>spawnSync(process.execPath,[
    'deployment-preflight.cli.mjs','--mode','locked'
  ],{
    cwd:new URL('.',import.meta.url),
    env:{...process.env,
      ORCA_MCP_RESOURCE:resource,
      ORCA_ISSUER_ORIGIN:issuer,...env
    },encoding:'utf8',timeout:5000
  });
  const badTls=run({NODE_TLS_REJECT_UNAUTHORIZED:'0'});
  assert.equal(badTls.status,2);
  assert.match(badTls.stderr,/TLS certificate verification/);
  const missing=run({ORCA_MCP_RESOURCE:''});
  assert.equal(missing.status,2);
  assert.match(missing.stderr,/supply separate/);
});
