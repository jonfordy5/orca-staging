import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import Provider from 'oidc-provider';
import {createStage21LockedIssuerAssembly} from '../locked-issuer-assembly.mjs';
import {createExistingResearcherSupabaseHttp} from '../supabase-existing-researcher-http.mjs';

const valid=()=>{
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const events=[];
  const verifiedIssuerConnector={
    async connect(){
      events.push('private_database');
      throw Error('LOCKED_CANNOT_CONNECT');
    }
  };
  const supabaseUserAdapter=createExistingResearcherSupabaseHttp({
    supabaseUrl:'https://vbziibatnejoswsdggga.supabase.co',
    publishableKey:'sb_publishable_'+'A'.repeat(32),
    fetchImpl:async()=>{events.push('supabase_http');throw Error('LOCKED_CANNOT_FETCH');}
  });
  const parameters={
    ProviderClass:Provider,
    issuerOrigin:'https://auth.orca.example.invalid',
    mcpResource:'https://mcp.orca.example.invalid/mcp',
    clientId:'orca-stage21-private-test-client',
    redirectUri:'https://callback.example.invalid/oauth',
    signingKid:'stage21-es256-key-0001',
    privateSigningJwk:privateKey.export({format:'jwk'}),
    providerCookieKeys:[
      randomBytes(32).toString('base64url'),
      randomBytes(32).toString('base64url')
    ],
    providerEncryptionKeyId:'stage21-provider-key-001',
    providerEncryptionKeyring:{
      'stage21-provider-key-001':randomBytes(32)
    },
    browserSessionKeyring:[{
      id:'stage21-browser-key-001',key:randomBytes(32)
    }],
    verifiedIssuerConnector,
    supabaseUserAdapter
  };
  return {parameters,events};
};
function responseCapture(){
  return {
    status:null,headers:null,body:null,
    writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
    end(payload){this.body=payload;this.writableEnded=true;}
  };
}
test('actual oidc-provider v9 assembles against encrypted PG and verified Supabase adapter without listener',async()=>{
  const {parameters,events}=valid();
  const assembly=createStage21LockedIssuerAssembly(parameters);
  assert.equal(assembly.mode,'locked-staging');
  assert.equal(assembly.publicAuthorizationEnabled,false);
  assert.equal(assembly.issuer,parameters.issuerOrigin);
  assert.equal(assembly.resource,parameters.mcpResource);
  assert.ok(!Object.hasOwn(assembly,'provider'));
  assert.ok(!Object.hasOwn(assembly,'signingKey'));
  assert.ok(!Object.hasOwn(assembly,'callback'));
  assert.ok(!Object.hasOwn(assembly,'consentFinalizer'));
  assert.equal(Object.isFrozen(assembly),true);
  const paths=['/auth','/token','/.well-known/oauth-authorization-server',
    '/session/bootstrap','/interaction/aaaaaaaaaaaaaaaa',
    '/interaction/aaaaaaaaaaaaaaaa/approve'];
  for(const url of paths){
    const res=responseCapture();
    await assembly.handle({method:'GET',url,headers:{}},res);
    assert.equal(res.status,503,url);
    assert.ok(!String(res.body).includes('PRIVATE KEY'));
    assert.equal(res.headers['cache-control']?.startsWith('no-store'),true);
  }
  assert.deepEqual(events,[],'constructing or invoking locked assembly must never contact a live service');
});
test('reject missing or public-only signing key and wrong signing algorithm',()=>{
  const {parameters}=valid();
  const wrongCurve=generateKeyPairSync('ec',{namedCurve:'secp384r1'})
    .privateKey.export({format:'jwk'});
  const noPrivate={...parameters.privateSigningJwk};
  delete noPrivate.d;
  for(const privateSigningJwk of [noPrivate,wrongCurve,
    {...parameters.privateSigningJwk,alg:'RS256'},
    {...parameters.privateSigningJwk,x:'X'.repeat(43)}]){
    assert.throws(()=>createStage21LockedIssuerAssembly({
      ...parameters,privateSigningJwk
    }),/stage21_verified_offline_issuer_configuration_required/);
  }
});
test('reject login bypass, wrong origins, shared key, duplicate cookie secret and missing persistence',()=>{
  const {parameters}=valid();
  const cases=[
    {issuerOrigin:'http://auth.orca.example.invalid'},
    {issuerOrigin:parameters.mcpResource.replace('/mcp','')},
    {mcpResource:'https://mcp.orca.example.invalid/mcp?token=secret'},
    {redirectUri:'http://callback.example.invalid/oauth'},
    {clientId:'bad\nclient'},
    {verifiedIssuerConnector:null},
    {supabaseUserAdapter:{auth:{getUser:async()=>({})}}},
    {providerCookieKeys:[parameters.providerCookieKeys[0],parameters.providerCookieKeys[0]]},
    {providerCookieKeys:['easilyguessed','notsecure']},
    {browserSessionKeyring:[{
      id:'stage21-browser-key-001',
      key:parameters.providerEncryptionKeyring['stage21-provider-key-001']
    }]},
    {providerEncryptionKeyId:'wrong-provider-key-0001'}
  ];
  for(const entry of cases)
    assert.throws(()=>createStage21LockedIssuerAssembly({
      ...parameters,...entry
    }),/stage21_verified_offline_issuer_configuration_required/);
});
