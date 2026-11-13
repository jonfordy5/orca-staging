// ORCA Stage 20 — restricted remote PostgreSQL connection factory.
// REVIEW-ONLY / NOT DEPLOYED. No network connection occurs on import.
// Call ONLY on the issuer or MCP backend. No browser, Data API, service_role,
// "postgres" superuser, environment-derived DATABASE_URL or SSL downgrade.
// The caller supplies pg.Client as ClientClass and secret-manager values.
// One dedicated direct/session-mode connection per operation: no pooled
// session role/cross-owner transaction state can survive a release.
import {X509Certificate} from 'node:crypto';

const PROJECT=/^[a-z]{20}$/;
const POOLER=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const ROLES=Object.freeze({
  issuer:{
    login:'orca_owned_issuer_login',
    dbRole:'orca_owned_issuer_writer'
  },
  grant_reader:{
    login:'orca_owned_mcp_grant_login',
    dbRole:'orca_owned_mcp_grant_reader'
  }
});
const deny=()=>{throw Error('verified_orca_private_database_connection_required');};
const has=x=>x&&typeof x==='object'&&!Array.isArray(x);

/**
 * Direct connection uses db.<project>.supabase.co:5432.
 * IPv4-only hosts can use SESSION pooler on port 5432. Transaction pooler
 * on 6543 is deliberately unsupported for session role switching.
 * Hostnames and custom login usernames MUST be copied from Supabase Connect;
 * never guess a region or derive a pooler hostname.
 */
export function createVerifiedOrcaDatabaseConnector({
  ClientClass,projectRef,mode,host,port=5432,database='postgres',
  loginUser,password,caPem,purpose,
  maxConcurrent=3
}={}){
  if(typeof ClientClass!=='function'||!PROJECT.test(projectRef||'')||
     !Object.hasOwn(ROLES,purpose)||typeof host!=='string'||
     !['direct','session_pooler'].includes(mode)||
     port!==5432||database!=='postgres'||
     !Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)
    deny();

  const selection=ROLES[purpose];
  const directHost='db.'+projectRef+'.supabase.co';
  if(mode==='direct'&&host!==directHost)deny();
  if(mode==='session_pooler'&&!POOLER.test(host))deny();
  const expectedUser=selection.login+
    (mode==='session_pooler'?'.'+projectRef:'');
  if(loginUser!==expectedUser||
     typeof password!=='string'||password.length<24||password.length>512||
     /[\r\n\0]/.test(password)||
     typeof caPem!=='string'||caPem.length<400||caPem.length>32768||
     !caPem.includes('-----BEGIN CERTIFICATE-----'))
    deny();
  try{
    new X509Certificate(caPem);
  }catch{deny();}

  const dbConfig={
    host,port,database,user:expectedUser,password,
    ssl:{
      ca:caPem,
      servername:host,
      rejectUnauthorized:true,
      minVersion:'TLSv1.2'
    },
    application_name:purpose==='issuer'?
      'orca-owned-issuer-staging':'orca-owned-grant-reader-staging',
    connectionTimeoutMillis:5000,
    query_timeout:5000,
    statement_timeout:4500,
    idle_in_transaction_session_timeout:8000,
    keepAlive:false
  };
  let inUse=0;
  const expectedRole=selection.dbRole;

  async function connect(){
    if(inUse>=maxConcurrent)deny();
    inUse++;
    let client,connected=false;
    try{
      client=new ClientClass(dbConfig);
      if(!client||typeof client.connect!=='function'||
         typeof client.query!=='function'||typeof client.end!=='function')
        deny();
      await client.connect();
      connected=true;
      // Independently check TLS after the library's own CA/hostname check.
      // "sslmode=require" alone is insufficient: it need not verify host.
      const socket=client.connection?.stream;
      if(socket?.encrypted!==true||socket.authorized!==true||
         socket.servername!==host)
        deny();

      const before=await client.query(
        'SELECT session_user AS login, current_user AS role'
      );
      if(before?.rows?.length!==1||
         before.rows[0]?.login!==expectedUser||
         before.rows[0]?.role!==expectedUser)
        deny();
      // Static role identifier, never a user-controlled SQL interpolation.
      // The login must have GRANT <dbRole> WITH INHERIT FALSE, SET TRUE.
      await client.query('SET ROLE '+expectedRole);
      const after=await client.query(
        'SELECT session_user AS login, current_user AS role'
      );
      if(after?.rows?.length!==1||
         after.rows[0]?.login!==expectedUser||
         after.rows[0]?.role!==expectedRole)
        deny();

      let released=false;
      return Object.freeze({
        query:(sql,values)=> {
          if(released)deny();
          return client.query(sql,values);
        },
        release(){
          if(released)return;
          released=true;
          // Do not return the role-selected client to another request.
          Promise.resolve().then(()=>client.end()).catch(()=>{}).finally(()=>{
            inUse--;
          });
        }
      });
    }catch{
      try{
        if(client&&connected)await client.end();
        else await client?.end?.();
      }catch{}
      inUse--;
      deny();
    }
  }
  return Object.freeze({connect});
}
