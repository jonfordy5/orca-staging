// ORCA Stage 21: transaction-scoped issuer private PostgreSQL query helper.
// The verified Stage 20 connection must authenticate as the issuer login,
// assume orca_owned_issuer_writer, and discard the connection after use.
// No arbitrary SQL from a browser, MCP tool, OAuth parameter or user input.
// This helper is for the issuer's *internal fixed adapters* only.
const SQL=/^(?:select|insert|update|delete)\s/i;
const TABLE=/\borca_owned_oauth_private\.(?:grants|provider_models|consent_challenges|browser_sessions)\b/i;
const deny=()=>{throw Error('orca_issuer_private_database_unavailable');};

export function createIssuerPrivateQuery({connector}={}){
  if(typeof connector?.connect!=='function')deny();
  return async function issuerQuery(statement,params=[]){
    if(typeof statement!=='string'||statement.length>4096||
       !SQL.test(statement)||!TABLE.test(statement)||
       statement.includes(';')||
       !Array.isArray(params)||params.length>20)deny();
    let connection,started=false;
    try{
      connection=await connector.connect();
      if(typeof connection?.query!=='function'||
         typeof connection?.release!=='function')deny();
      await connection.query('BEGIN');
      started=true;
      // Stage 20 connector has already verified session_user, role, and TLS.
      const result=await connection.query(statement,params);
      if(typeof result?.rowCount!=='number'||!Array.isArray(result.rows))
        deny();
      await connection.query('COMMIT');
      started=false;
      return result;
    }catch{
      if(started){try{await connection.query('ROLLBACK');}catch{}}
      deny();
    }finally{
      try{connection?.release?.();}catch{}
    }
  };
}
