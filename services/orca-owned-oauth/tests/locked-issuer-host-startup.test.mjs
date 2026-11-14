import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createStage22LockedIssuerHostStartup} from '../locked-issuer-host-startup.mjs';

const REJECT=/stage22_locked_secret_startup_rejected/;
const baseline=()=>({
  ORCA_STAGE22_LOCKED_ACK:'OFFLINE_ASSEMBLY_ONLY',
  ORCA_OWNED_ISSUER_ENABLED:'false',
  ORCA_MCP_ENABLED:'false',
  ORCA_DB_PROJECT_REF:'vbziibatnejoswsdggga',
  ORCA_SUPABASE_URL:'https://vbziibatnejoswsdggga.supabase.co',
  ORCA_DB_MODE:'direct',
  ORCA_DB_HOST:'db.vbziibatnejoswsdggga.supabase.co',
  ORCA_DB_LOGIN_USER:'orca_owned_issuer_login',
  ORCA_ISSUER_ORIGIN:'https://auth.example.invalid',
  ORCA_MCP_RESOURCE:'https://mcp.example.invalid/mcp',
  ORCA_OAUTH_CLIENT_ID:'stage22-client',
  ORCA_OAUTH_REDIRECT_URI:'https://client.example.invalid/callback'
});
const invoke=(env={},secretDirectory='/run/secrets/orca-owned-oauth')=>
  createStage22LockedIssuerHostStartup({
    env:{...baseline(),...env},secretDirectory,
    ProviderClass:class {},ClientClass:class {},fetchImpl:async()=>{}
  });
test('Stage22 refuses activation, dangerous TLS, and incorrect project before touching secrets',()=>{
  for(const env of [
    {ORCA_OWNED_ISSUER_ENABLED:'true'},
    {ORCA_MCP_ENABLED:'true'},
    {ORCA_STAGE22_LOCKED_ACK:'DEPLOY'},
    {NODE_TLS_REJECT_UNAUTHORIZED:'0'},
    {ORCA_DB_PROJECT_REF:'otherprojectxxxxxxxx'},
    {ORCA_SUPABASE_URL:'https://evil.example'},
    {ORCA_DB_MODE:'transaction_pooler'},
  ]) assert.throws(()=>invoke(env),REJECT);
  assert.throws(()=>invoke({},'relative/path'),REJECT);
  assert.throws(()=>invoke({},'/tmp/../secrets'),REJECT);
});
test('Stage22 refuses absent, loose, linked and symlinked secret mounts',()=>{
  const root=mkdtempSync(join(tmpdir(),'orca-stage22-'));
  try{
    const folder=join(root,'secrets');
    mkdirSync(folder,{mode:0o700});
    assert.throws(()=>invoke({},folder),REJECT,'missing key files fail closed');
    writeFileSync(join(folder,'signing-jwk.json'),'{}',{mode:0o600});
    assert.throws(()=>invoke({},folder),REJECT,'invalid signing config fails closed');
    chmodSync(folder,0o755);
    assert.throws(()=>invoke({},folder),REJECT,'world-readable directory is rejected');
    chmodSync(folder,0o700);
    const alias=join(root,'alias');
    symlinkSync(folder,alias,'dir');
    assert.throws(()=>invoke({},alias),REJECT,'symlink directory is rejected');
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('Stage22 rejects malformed and reused encryption keyring before any network access',()=>{
  const root=mkdtempSync(join(tmpdir(),'orca-stage22-'));
  try{
    const folder=join(root,'secrets');
    mkdirSync(folder,{mode:0o700});
    const store=(name,data)=>writeFileSync(join(folder,name),
      typeof data==='string'?data:JSON.stringify(data),{mode:0o600});
    const key=randomBytes(32).toString('base64url');
    store('signing-jwk.json',{kid:'stage22-signing-key'});
    store('provider-cookie-keys.json',[key,key]);
    store('provider-keyring.json',{currentKeyId:'stage22-provider-key',
      keys:{'stage22-provider-key':key}});
    store('browser-session-keyring.json',{keys:[{id:'stage22-browser-key',key}]});
    store('issuer-db-password.txt','x'.repeat(32));
    store('postgres-ca.pem','not a certificate');
    store('supabase-publishable-key.txt','sb_publishable_'+'A'.repeat(32));
    assert.throws(()=>invoke({},folder),REJECT,'reuse between keys is denied');
    store('provider-cookie-keys.json',[randomBytes(32).toString('base64url'),
      randomBytes(32).toString('base64url')]);
    chmodSync(join(folder,'provider-keyring.json'),0o644);
    assert.throws(()=>invoke({},folder),REJECT,'group/world-readable file denied');
  }finally{rmSync(root,{recursive:true,force:true});}
});
