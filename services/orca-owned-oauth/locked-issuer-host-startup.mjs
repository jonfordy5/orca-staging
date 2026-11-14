// ORCA Stage 22 — protected-file startup for the locked Stage 21 issuer.
// Source/CI only. This module NEVER opens a port, serves OAuth, migrates a
// database, stores secrets in logs, or changes the release switch.
import {constants,openSync,closeSync,readFileSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createStage21LockedIssuerAssembly} from './locked-issuer-assembly.mjs';
import {createVerifiedOrcaDatabaseConnector} from './verified-supabase-db-connector.mjs';
import {createExistingResearcherSupabaseHttp} from './supabase-existing-researcher-http.mjs';

const DEFAULT_MOUNT='/run/secrets/orca-owned-oauth';
const STAGING_PROJECT='vbziibatnejoswsdggga';
const KEY_ID=/^[A-Za-z0-9_-]{8,48}$/;
const reject=()=>{throw Error('stage22_locked_secret_startup_rejected');};
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(v)=>typeof v==='string'&&v.length>0&&v.length<=1024&&
  v.trim()===v&&!/[\r\n\0]/.test(v);

function required(env,name){
  const value=env?.[name];
  if(!has(value))reject();
  return value;
}
function fileContents(directory,name,maxBytes){
  const path=join(directory,name);
  let descriptor;
  try{
    const before=lstatSync(path);
    if(!before.isFile()||before.nlink!==1||before.size<1||
       before.size>maxBytes||(before.mode&0o077)!==0||
       (before.mode&0o111)!==0||(before.mode&0o400)===0||
       before.uid!==process.getuid())reject();
    descriptor=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const after=fstatSync(descriptor);
    if(!after.isFile()||after.nlink!==1||after.size!==before.size||
       after.ino!==before.ino||after.dev!==before.dev||
       after.uid!==before.uid||after.mode!==before.mode||
       (after.mode&0o077)!==0)reject();
    const content=readFileSync(descriptor,'utf8');
    if(Buffer.byteLength(content)>maxBytes)reject();
    return content;
  }catch{reject();}
  finally{if(descriptor!==undefined)try{closeSync(descriptor);}catch{}}
}
function readJson(directory,name,maxBytes=8192){
  try{
    const data=JSON.parse(fileContents(directory,name,maxBytes));
    if(data===null||typeof data!=='object')reject();
    return data;
  }catch{reject();}
}
function decodeKey(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))reject();
  const key=Buffer.from(value,'base64url');
  if(key.byteLength!==32||key.toString('base64url')!==value)reject();
  return key;
}
function readSecrets(directory){
  // The directory itself must be a real, private directory, not a symlink.
  try{
    const resolved=resolve(directory);
    if(resolved!==directory||realpathSync(directory)!==resolved)reject();
    const info=lstatSync(directory);
    if(!info.isDirectory()||(info.mode&0o077)!==0||
       (info.mode&0o500)!==0o500||info.uid!==process.getuid())reject();
  }catch{reject();}
  const signing=readJson(directory,'signing-jwk.json');
  if(!isObject(signing)||!KEY_ID.test(signing.kid||''))reject();
  const cookieStrings=readJson(directory,'provider-cookie-keys.json');
  if(!Array.isArray(cookieStrings)||cookieStrings.length<2||
     cookieStrings.length>3)reject();
  const provider=readJson(directory,'provider-keyring.json');
  const browser=readJson(directory,'browser-session-keyring.json');
  if(!isObject(provider)||!KEY_ID.test(provider.currentKeyId||'')||
     !isObject(provider.keys)||!isObject(browser)||
     !Array.isArray(browser.keys)||browser.keys.length<1||
     browser.keys.length>3)reject();

  const used=new Set();
  const uniqueKey=value=>{
    const key=decodeKey(value);
    const fingerprint=key.toString('hex');
    if(used.has(fingerprint))reject();
    used.add(fingerprint);
    return key;
  };
  const providerCookieKeys=cookieStrings.map(k=>
    uniqueKey(k).toString('base64url'));
  const providerEncryptionKeyring=Object.create(null);
  const entries=Object.entries(provider.keys);
  if(entries.length<1||entries.length>3||
     !Object.hasOwn(provider.keys,provider.currentKeyId))reject();
  for(const [id,encoded] of entries){
    if(!KEY_ID.test(id))reject();
    providerEncryptionKeyring[id]=uniqueKey(encoded);
  }
  const ids=new Set();
  const browserSessionKeyring=browser.keys.map(record=>{
    if(!isObject(record)||!KEY_ID.test(record.id||'')||
       ids.has(record.id))reject();
    ids.add(record.id);
    return {id:record.id,key:uniqueKey(record.key)};
  });
  const password=fileContents(directory,'issuer-db-password.txt',512);
  if(password.length<24||password.length>512||
     /[\r\n\0]/.test(password))reject();
  const caPem=fileContents(directory,'postgres-ca.pem',32768);
  const publishableKey=fileContents(directory,'supabase-publishable-key.txt',512);
  if(!/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey))
    reject();
  return {signingKid:signing.kid,privateSigningJwk:signing,
    providerCookieKeys,providerEncryptionKeyId:provider.currentKeyId,
    providerEncryptionKeyring,browserSessionKeyring,password,caPem,
    publishableKey};
}

/**
 * Build only the always-503 Stage 21 HTTP handler, using protected local
 * secret files. ProviderClass and ClientClass are injected; no import-time
 * database access or listener exists. NOT a public startup entrypoint.
 *
 * A separately approved and security-reviewed live entrypoint is required.
 */
export function createStage22LockedIssuerHostStartup({
  env=process.env,secretDirectory=DEFAULT_MOUNT,ProviderClass,ClientClass,
  fetchImpl=fetch,isTrustedHttps
}={}){
  if(!isObject(env)||typeof ProviderClass!=='function'||
     typeof ClientClass!=='function'||typeof fetchImpl!=='function'||
     typeof secretDirectory!=='string'||!secretDirectory.startsWith('/')||
     secretDirectory.includes('\0')||secretDirectory.includes('..')||
     env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||
     process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||
     required(env,'ORCA_STAGE22_LOCKED_ACK')!=='OFFLINE_ASSEMBLY_ONLY'||
     required(env,'ORCA_OWNED_ISSUER_ENABLED')!=='false'||
     required(env,'ORCA_MCP_ENABLED')!=='false')reject();

  const projectRef=required(env,'ORCA_DB_PROJECT_REF');
  const supabaseUrl=required(env,'ORCA_SUPABASE_URL');
  if(projectRef!==STAGING_PROJECT||
     supabaseUrl!=='https://'+STAGING_PROJECT+'.supabase.co')reject();

  const secret=readSecrets(secretDirectory);
  try{
    const verifiedIssuerConnector=createVerifiedOrcaDatabaseConnector({
      ClientClass,projectRef,mode:required(env,'ORCA_DB_MODE'),
      host:required(env,'ORCA_DB_HOST'),
      loginUser:required(env,'ORCA_DB_LOGIN_USER'),
      password:secret.password,caPem:secret.caPem,purpose:'issuer'
    });
    const supabaseUserAdapter=createExistingResearcherSupabaseHttp({
      supabaseUrl,publishableKey:secret.publishableKey,fetchImpl
    });
    const args={
      ProviderClass,verifiedIssuerConnector,supabaseUserAdapter,
      issuerOrigin:required(env,'ORCA_ISSUER_ORIGIN'),
      mcpResource:required(env,'ORCA_MCP_RESOURCE'),
      clientId:required(env,'ORCA_OAUTH_CLIENT_ID'),
      redirectUri:required(env,'ORCA_OAUTH_REDIRECT_URI'),
      signingKid:secret.signingKid,
      privateSigningJwk:secret.privateSigningJwk,
      providerCookieKeys:secret.providerCookieKeys,
      providerEncryptionKeyId:secret.providerEncryptionKeyId,
      providerEncryptionKeyring:secret.providerEncryptionKeyring,
      browserSessionKeyring:secret.browserSessionKeyring,
      ...(isTrustedHttps?{isTrustedHttps}:{})
    };
    return createStage21LockedIssuerAssembly(args);
  }catch{reject();}
}
