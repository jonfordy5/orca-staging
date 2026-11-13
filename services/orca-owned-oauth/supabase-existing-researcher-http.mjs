// ORCA Stage 18 — real Supabase user-verification HTTP adapter.
// CODE ONLY / NOT DEPLOYED. This bridges the issuer's EXISTING researcher
// check to Supabase Auth and the existing owner-scoped public profiles API.
// No new user is created, no profile or permission is ever written.
// The caller MUST supply a verified user access token from the issuer's
// short-lived server-held browser session, never an agent OAuth bearer.
// Do not configure a service_role/secret key here.
const PROJECT_HOST=/^[a-z]{20}\.supabase\.co$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_RESPONSE=32768;
const fail=()=>{throw Error('supabase_existing_user_verification_unavailable');};

function exactSupabaseProjectUrl(raw){
  if(typeof raw!=='string')fail();
  let url;
  try{url=new URL(raw);}catch{fail();}
  if(url.protocol!=='https:'||url.origin!==raw||url.username||
     url.password||url.port||url.pathname!=='/'||url.search||url.hash||
     !PROJECT_HOST.test(url.hostname))
    fail();
  return url.origin;
}
function publicKey(key){
  // A public publishable key is NOT a user authorization or service key.
  // Reject legacy JWT keys here. Operators should obtain the current
  // publishable key through Supabase; it can be used in browser code too.
  if(typeof key!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(key))
    fail();
  return key;
}
function bearer(value){
  if(typeof value!=='string'||value.length<24||value.length>8192||
     !TOKEN.test(value))fail();
  return value;
}
async function limitedJson(fetchImpl,url,token,apikey){
  let response;
  try{
    response=await fetchImpl(url,{
      method:'GET',
      headers:{
        'apikey':apikey,
        'authorization':'Bearer '+token,
        'accept':'application/json'
      },
      redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(7000)
    });
  }catch{fail();}
  if(!(response instanceof Response)||response.status!==200||
     !/application\/json(?:\s*;|$)/i.test(
       response.headers.get('content-type')||'')||
     (response.headers.get('content-length')!==null&&
       (!/^\d+$/.test(response.headers.get('content-length'))||
        Number(response.headers.get('content-length'))>MAX_RESPONSE)))
    fail();
  const reader=response.body?.getReader();
  if(!reader)fail();
  let size=0;
  const parts=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE)fail();
      parts.push(value);
    }
  }catch{fail();}
  finally{
    if(size>MAX_RESPONSE){try{await reader.cancel();}catch{}}
    reader.releaseLock();
  }
  const bytes=new Uint8Array(size);let index=0;
  for(const part of parts){bytes.set(part,index);index+=part.byteLength;}
  try{
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{fail();}
}

/**
 * Use only against the real, configured staging Supabase project URL.
 * ownerScopedProfileRead is issued with the VERIFIED USER'S access token,
 * never a service-role key; RLS must independently restrict owner_id.
 * Keep the public agent_profiles SELECT policy owner-scoped.
 */
export function createExistingResearcherSupabaseHttp({
  supabaseUrl,publishableKey,fetchImpl=fetch
}={}){
  const base=exactSupabaseProjectUrl(supabaseUrl);
  const key=publicKey(publishableKey);
  if(typeof fetchImpl!=='function')fail();
  const auth=Object.freeze({
    async getUser(accessToken){
      try{
        const verified=await limitedJson(fetchImpl,base+'/auth/v1/user',
          bearer(accessToken),key);
        if(!verified||typeof verified!=='object'||Array.isArray(verified)||
           !UUID.test(verified.id||'')||verified.is_anonymous===true)
          fail();
        // Do not return user_metadata (never authorization evidence).
        return {data:{user:{id:verified.id}},error:null};
      }catch{
        return {data:{user:null},error:{code:'supabase_user_not_verified'}};
      }
    }
  });
  async function ownerScopedProfileRead(ownerId,accessToken){
    if(typeof ownerId!=='string'||!UUID.test(ownerId))fail();
    const url=base+'/rest/v1/agent_profiles?'+new URLSearchParams({
      select:'owner_id,opted_in',owner_id:'eq.'+ownerId,limit:'2'
    });
    const rows=await limitedJson(fetchImpl,url,bearer(accessToken),key);
    if(!Array.isArray(rows)||rows.length!==1||
       typeof rows[0]?.owner_id!=='string'||
       rows[0].owner_id!==ownerId||
       rows[0].opted_in!==true)
      fail();
    return {owner_id:rows[0].owner_id,opted_in:true};
  }
  return Object.freeze({auth,ownerScopedProfileRead});
}
