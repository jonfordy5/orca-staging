// ORCA Stage 19 — MCP's ONLY permitted private OAuth grant query.
// CODE ONLY. Requires a dedicated private PostgreSQL pool whose current_user
// is the NOLOGIN/NOBYPASSRLS orca_owned_mcp_grant_reader role. Never use
// Supabase service_role, a public RPC, or an issuer writer connection.
// The caller must first cryptographically verify the ORCA ES256 access
// token, exact issuer/audience/approved client and the token's scope.
// Custom PostgreSQL GUCs are defense-in-depth, not authentication.
import {CURRENT_GRANT_SELECT,OWNED_READ_SCOPE} from './grant-registry.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT=/^[\x21-\x7e]{1,512}$/;
const fail=()=>{throw Error('private_current_grant_lookup_unavailable');};

function resourceUrl(raw){
  if(typeof raw!=='string')fail();
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||
       url.search||url.href!==raw)
      fail();
    return url.href;
  }catch{fail();}
}
/**
 * query(statement, values) contract matches the existing OwnedGrantRegistry.
 * The SQL string MUST equal the one fixed current-grant SELECT constant.
 * Each call obtains a fresh connection, verifies the PostgreSQL CURRENT_USER,
 * and uses transaction-local context for row-level security. There is no
 * issuer grant creation or revoked-grant cache on this path.
 *
 * pool.connect() must return a pg-style client with query() and release().
 * Pool credentials and SSL CA verification are deployment-only secrets.
 */
export function createVerifiedCurrentGrantQuery({pool,resource}={}){
  if(typeof pool?.connect!=='function')fail();
  const expectedResource=resourceUrl(resource);
  return async function query(statement,values){
    if(statement!==CURRENT_GRANT_SELECT||
       !Array.isArray(values)||values.length!==5||
       !UUID.test(values[0]||'')||!UUID.test(values[1]||'')||
       typeof values[2]!=='string'||!CLIENT.test(values[2])||
       values[3]!==expectedResource||values[4]!==OWNED_READ_SCOPE)
      fail();
    let client;
    try{
      client=await pool.connect();
    }catch{fail();}
    if(typeof client?.query!=='function'||
       typeof client?.release!=='function'){
      try{client?.release?.();}catch{}
      fail();
    }
    let started=false;
    try{
      await client.query('BEGIN TRANSACTION READ ONLY');
      started=true;
      const role=await client.query('SELECT current_user AS role');
      if(role?.rows?.length!==1||
         role.rows[0]?.role!=='orca_owned_mcp_grant_reader')
        fail();
      const verifiedFields=[
        ['orca.verified_owner_id',values[1]],
        ['orca.verified_grant_id',values[0]],
        ['orca.verified_client_id',values[2]],
        ['orca.verified_resource',values[3]]
      ];
      for(const [field,value] of verifiedFields){
        await client.query(
          "SELECT set_config($1::text,$2::text,true)",
          [field,value]
        );
      }
      const result=await client.query(CURRENT_GRANT_SELECT,values);
      if(!result||!Array.isArray(result.rows)||
         !Number.isInteger(result.rowCount)||
         result.rowCount<0||result.rowCount>1||
         result.rows.length!==result.rowCount||
         (result.rowCount===1&&result.rows[0]?.active!==1))
        fail();
      await client.query('COMMIT');
      started=false;
      return result;
    }catch{
      if(started){try{await client.query('ROLLBACK');}catch{}}
      fail();
    }finally{
      client.release();
    }
  };
}
