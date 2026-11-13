import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalPreviewServer,PREVIEW_ISSUER,PREVIEW_RESOURCE
} from '../services/orca-owned-oauth/dev-preview.mjs';

test('Installed standards-library issuer starts on loopback and exposes only public discovery',async t=>{
  const server=createLocalPreviewServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const get=async(path,method='GET')=>fetch(origin+path,{
    method,redirect:'manual',signal:AbortSignal.timeout(7000)
  });

  const discovery=await get('/.well-known/openid-configuration');
  assert.equal(discovery.status,200);
  const metadata=await discovery.json();
  assert.equal(metadata.issuer,PREVIEW_ISSUER);
  // Local HTTP preview differs from the future HTTPS public issuer origin.
  // Assert endpoint structure, NOT false public-host interoperability.
  assert.ok(typeof metadata.authorization_endpoint==='string');
  assert.ok(typeof metadata.token_endpoint==='string');
  assert.ok(typeof metadata.jwks_uri==='string');
  assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  assert.ok(metadata.response_types_supported.includes('code'));
  // A publicly deployed issuer must advertise all HTTPS URLs at its exact
  // issuer origin; this loopback smoke deliberately DOES NOT establish that.
  console.log('Preview authorization endpoint: '+metadata.authorization_endpoint);
  console.log('Preview token endpoint: '+metadata.token_endpoint);
  console.log('Preview JWKS endpoint: '+metadata.jwks_uri);
  const grantTypes=metadata.grant_types_supported||[];
  assert.ok(grantTypes.includes('authorization_code'));
  assert.ok(!grantTypes.includes('client_credentials'));
  const jwks=await get(new URL(metadata.jwks_uri).pathname);
  assert.equal(jwks.status,200);
  const publicKeys=(await jwks.json()).keys;
  assert.ok(publicKeys.length>=1);
  assert.ok(publicKeys.every(k=>!k.d&&!k.p&&!k.q&&k.kty==='EC'));

  // Regardless of metadata content, NONE of the following endpoints can
  // process authorization, approval, exchange, refresh, or client registration.
  for(const [path,method] of [
    [new URL(metadata.authorization_endpoint).pathname,'GET'],
    [new URL(metadata.token_endpoint).pathname,'POST'],
    ['/interaction/unavailable','GET'],
    ['/interaction/anything/approve','POST'],
    ['/reg','POST'],
    ['/grant','GET'],
    ['/jwt','GET'],
    ['/health','GET']
  ]){
    const response=await get(path,method);
    assert.equal(response.status,503,method+' '+path);
    const body=await response.json();
    assert.equal(body.error,'preview_not_active');
  }
  assert.equal((await get('/.well-known/openid-configuration','POST')).status,503);
  assert.equal((await get('/.well-known/openid-configuration?token=test')).status,200);
  console.log('PASS: oidc-provider library booted; public metadata & public JWKS served on loopback only.');
  console.log('PASS: authorize, token, login, consent, registration and other routes reject all requests.');
  console.log('IMPORTANT: a preview metadata smoke is not a usable OAuth issuer or connected ChatGPT agent.');
});
