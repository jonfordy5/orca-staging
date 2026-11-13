// ORCA Stage 10: PostgreSQL data boundary for authenticated MCP reads.
// CODE ONLY; not a deployed DB connection, and no role/migration changes.
// The injected pool MUST connect as the dedicated NOLOGIN/NOBYPASSRLS
// orca_owned_mcp_reader role (via an audited authenticated pool setup).
// Only allowlisted parameterized SELECT statements execute, each inside
// a READ ONLY transaction with a transaction-local verified owner context.
import {RESEARCH_READ_SQL} from './read-only-research-dispatcher.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATEMENTS=new Map([
  [RESEARCH_READ_SQL.PROFILE_SQL,1],
  [RESEARCH_READ_SQL.MEMBERSHIP_SQL,2],
  [RESEARCH_READ_SQL.ASSIGNMENT_SQL,2]
]);
const deny=()=>{throw Error('read_only_research_database_unavailable');};

/**
 * Never expose this query function to the agent or the browser. Only the
 * owner-scoped dispatcher may call it after verified JWT + active grant.
 * pool.connect() must hand back one private PostgreSQL session with a
 * release() method. No session variables survive COMMIT.
 */
export function createVerifiedOwnerReadQuery({pool}={}){
  if(typeof pool?.connect!=='function')
    throw Error('dedicated_postgresql_reader_pool_required');
  return async function query(statement,parameters){
    if(!STATEMENTS.has(statement)||
       !Array.isArray(parameters)||
       parameters.length!==STATEMENTS.get(statement)||
       typeof parameters[0]!=='string'||!UUID.test(parameters[0])||
       (parameters.length===2&&parameters[1]!==null&&
         !(typeof parameters[1]==='string'&&
           /^[A-Z][A-Z0-9.]{0,9}$/.test(parameters[1]))))
      deny();
    const connection=await pool.connect();
    if(!connection||typeof connection.query!=='function'||
       typeof connection.release!=='function')deny();
    let begun=false;
    try{
      await connection.query('BEGIN TRANSACTION READ ONLY');
      begun=true;
      const role=await connection.query('SELECT current_user AS role');
      if(role?.rows?.length!==1||
         role.rows[0].role!=='orca_owned_mcp_reader')
        deny(); // no service-role, postgres, authenticator or issuer-owner.
      await connection.query(
        "SELECT set_config('orca.verified_owner_id', $1::text, true)",
        [parameters[0]]
      );
      const result=await connection.query(statement,parameters);
      if(!result||!Array.isArray(result.rows))deny();
      await connection.query('COMMIT');
      begun=false;
      return result;
    }catch{
      if(begun){
        try{await connection.query('ROLLBACK');}catch{}
      }
      deny();
    }finally{
      connection.release();
    }
  };
}
