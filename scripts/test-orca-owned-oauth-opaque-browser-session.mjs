import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {
  createOpaqueBrowserSessionBridge,createPrivatePostgresSessionStore
} from '../services/orca-owned-oauth/opaque-browser-session.mjs';

const issuer='https://auth.orca.example';
const owner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const bearer='header.payload.signature';
function fixture(){
  let timestamp=1800000000000,user=owner,verified=true,optedIn=true,checks=0;
  const records=new Map();
  const store={
    async create(row){
      const k=row.sessionHash.toString('hex');
      if(records.has(k))return false;
      records.set(k,{...row});
      return true;
    },
    async find(digest){return records.get(digest.toString('hex'))||null;},
    async revoke(digest){
      return records.delete(digest.toString('hex'));
    }
  };
  const keys=[{id:'opaque-key-0001',key:randomBytes(32)}];
  const opts={
    issuerOrigin:issuer,store,keyring:keys,
    auth:{getUser:async t=>{
      checks++;assert.equal(t,bearer);
      return verified?{data:{user:{id:user}}}:{error:Error('expired')};
    }},
    ownerScopedProfileRead:async id=>({owner_id:id,opted_in:optedIn}),
    isTrustedHttps:req=>req.verifiedTls===true,
    now:()=>timestamp,maxAgeSeconds:600
  };
  const bridge=createOpaqueBrowserSessionBridge(opts);
  const req=(overrides={})=>({
    method:'POST',verifiedTls:true,headers:{
      host:'auth.orca.example',origin:issuer,'content-type':'application/json',
      'sec-fetch-site':'same-origin'
    },...overrides
  });
  const issue=()=>bridge.issueSessionCookie(req(),{supabaseAccessToken:bearer});
  const get=cookie=>bridge.readTrustedBrowserSession(req({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  }));
  return {bridge,opts,req,issue,get,records,store,keys,
    clock:ms=>timestamp+=ms,
    setUser:x=>user=x,setVerified:x=>verified=x,
    setOptIn:x=>optedIn=x,checks:()=>checks};
}
test('new cookie is opaque and 3x shorter: bearer encrypted server-side only',async()=>{
  const f=fixture();
  const issued=await f.issue();
  const cookie=issued.setCookie.split(';')[0];
  assert.match(cookie,/^__Host-orca_oauth_session=[A-Za-z0-9_-]{43}$/);
  assert.ok(!issued.setCookie.includes(bearer));
  assert.ok(issued.setCookie.length<180);
  assert.match(issued.setCookie,/Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.equal(f.records.size,1);
  const row=[...f.records.values()][0];
  assert.equal(row.ownerId,owner);
  assert.equal(row.sessionHash.length,32);
  assert.equal(row.iv.length,12);
  assert.equal(row.tag.length,16);
  assert.equal(row.ciphertext.includes(Buffer.from(bearer)),false);
  const session=await f.get(cookie);
  assert.equal(session.supabaseAccessToken,bearer);
  assert.match(session.browserSessionId,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.checks(),1,'session reader delegates repeat Auth checks to interaction controller');
  f.clock(600001);
  await assert.rejects(f.get(cookie),/invalid_or_expired_browser_session/);
});

test('logout revokes durable record before issuing cookie-clear instruction',async()=>{
  const f=fixture();
  const cookie=(await f.issue()).setCookie.split(';')[0];
  const clear=await f.bridge.clearSessionCookie(f.req({
    headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'application/json',cookie}
  }));
  assert.match(clear,/Max-Age=0/);
  assert.equal(f.records.size,0);
  await assert.rejects(f.get(cookie),/invalid_or_expired_browser_session/);
  await assert.rejects(f.bridge.clearSessionCookie(f.req({
    headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'application/json',cookie}
  })),/private_session_revoke_unconfirmed/);
});

test('invalid TLS, host, origin, cross-site requests and bearer fail before Supabase check',async()=>{
  const f=fixture();
  const changes=[
    {verifiedTls:false},
    {headers:{host:'other.example',origin:issuer,'content-type':'application/json'}},
    {headers:{host:'auth.orca.example',origin:'https://evil.example','content-type':'application/json'}},
    {method:'GET'},
    {headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'application/json','sec-fetch-site':'cross-site'}},
    {headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'application/json',authorization:'Bearer evil'}},
    {headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'text/plain'}}
  ];
  for(const change of changes)
    await assert.rejects(f.bridge.issueSessionCookie(f.req(change),
      {supabaseAccessToken:bearer}));
  assert.equal(f.records.size,0);
  assert.equal(f.checks(),0);
});
test('expired Supabase identity or opted-out profile cannot create a cookie',async()=>{
  const f=fixture();
  f.setVerified(false);
  await assert.rejects(f.issue(),/supabase_user_not_verified/);
  f.setVerified(true);f.setOptIn(false);
  await assert.rejects(f.issue(),/existing_orca_profile_or_consent_required/);
  assert.equal(f.records.size,0);
});
test('tampered, duplicate, unknown cookie and ciphertext cannot be used',async()=>{
  const f=fixture();
  const cookie=(await f.issue()).setCookie.split(';')[0];
  await assert.rejects(f.get(cookie+'x'),/invalid_browser_session_handle/);
  await assert.rejects(f.get(cookie+'; '+cookie),/missing_browser_session/);
  await assert.rejects(f.get('__Host-orca_oauth_session='+'z'.repeat(43)),
    /invalid_or_expired_browser_session/);
  const row=[...f.records.values()][0];
  row.ciphertext=Buffer.from(row.ciphertext);
  row.ciphertext[0]^=1;
  await assert.rejects(f.get(cookie),/invalid_private_session_record/);
});
test('key rotation permits old sessions only while old key remains authorized',async()=>{
  const f=fixture();
  const oldCookie=(await f.issue()).setCookie.split(';')[0];
  const newer={id:'opaque-key-0002',key:randomBytes(32)};
  const rotate=createOpaqueBrowserSessionBridge({
    ...f.opts,keyring:[newer,f.keys[0]]
  });
  const req=f.req({method:'GET',headers:{host:'auth.orca.example',cookie:oldCookie}});
  assert.equal((await rotate.readTrustedBrowserSession(req)).supabaseAccessToken,bearer);
  const newIssue=await rotate.issueSessionCookie(f.req(),{supabaseAccessToken:bearer});
  const newCookie=newIssue.setCookie.split(';')[0];
  assert.equal((await rotate.readTrustedBrowserSession(f.req({
    method:'GET',headers:{host:'auth.orca.example',cookie:newCookie}
  }))).supabaseAccessToken,bearer);
  await assert.rejects(f.get(newCookie),/invalid_private_session_record/);
});

test('Postgres adapter uses only fixed parameterized queries for private encrypted records',async()=>{
  const rows=new Map(),calls=[];
  const query=async(sql,args)=>{
    calls.push({sql,args});
    if(sql.startsWith('insert into')){
      const [hash,ownerId,keyId,iv,ciphertext,tag,issuedAt,expiresAt]=args;
      rows.set(hash.toString('hex'),{
        session_hash:hash,owner_id:ownerId,key_id:keyId,iv,ciphertext,tag,
        issued_at_ms:issuedAt,expires_at_ms:expiresAt
      });
      return {rowCount:1,rows:[{session_hash:hash}]};
    }
    if(sql.startsWith('select session_hash')){
      const row=rows.get(args[0].toString('hex'));
      return row?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]};
    }
    if(sql.startsWith('update')){
      const row=rows.get(args[0].toString('hex'));
      if(!row)return {rowCount:0,rows:[]};
      rows.delete(args[0].toString('hex'));
      return {rowCount:1,rows:[{session_hash:args[0]}]};
    }
    throw Error('unexpected_sql');
  };
  const store=createPrivatePostgresSessionStore({query});
  const f=fixture();
  const bridge=createOpaqueBrowserSessionBridge({...f.opts,store});
  const issued=await bridge.issueSessionCookie(f.req(),{supabaseAccessToken:bearer});
  const cookie=issued.setCookie.split(';')[0];
  const loaded=await bridge.readTrustedBrowserSession(f.req({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  }));
  assert.equal(loaded.supabaseAccessToken,bearer);
  assert.match(await bridge.clearSessionCookie(f.req({
    headers:{host:'auth.orca.example',origin:issuer,
      'content-type':'application/json',cookie}
  })),/Max-Age=0/);
  assert.equal(rows.size,0);
  assert.deepEqual(calls.map(x=>x.sql.split(' ')[0]),['insert','select','update']);
  assert.ok(calls.every(x=>!x.sql.includes(bearer)));
  assert.ok(calls.every(x=>!JSON.stringify(x.args).includes(bearer)));
});
