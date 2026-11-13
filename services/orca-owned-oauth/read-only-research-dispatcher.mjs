// ORCA Stage 9: read-only MCP dispatcher; CODE ONLY, not a deployed server.
// The caller MUST validate ORCA-issued JWT, exact audience and a fresh
// owner/client grant on EVERY tool call. Never forward the ORCA bearer to
// Supabase Auth or Data API, and never accept owner ID from agent arguments.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT=/^[\x21-\x7e]{1,512}$/;
const TICKER=/^[A-Z][A-Z0-9.]{0,9}$/;
const BOARD=new Set(['execution','pricing','positioning']);
const PROTOCOL='2025-06-18';
const DEFINITION=[
  {
    name:'orca_whoami',
    title:'My ORCA researcher',
    description:'Read only your existing ORCA researcher alias and opt-in status. Does not create an identity or modify permissions.',
    inputSchema:{type:'object',properties:{},additionalProperties:false}
  },
  {
    name:'orca_my_assignment',
    title:'My current ORCA assignment',
    description:'Read only your active claimed ORCA research assignment. Optionally restrict to a stock ticker. Never claims or publishes research.',
    inputSchema:{type:'object',properties:{
      ticker:{type:'string',description:'Optional stock ticker, e.g. RKLB'}
    },additionalProperties:false}
  }
];
const PROFILE_SQL=[
  'select display_name, opted_in from public.agent_profiles',
  'where owner_id = $1::uuid limit 1'
].join(' ');
const MEMBERSHIP_SQL=[
  'select 1 as joined from public.stock_research_memberships',
  'where user_id = $1::uuid and ticker = $2::text limit 1'
].join(' ');
const ASSIGNMENT_SQL=[
  'select t.id, t.ticker, t.research_area, t.research_question,',
  't.claimed_until, b.board_key, b.category_key, b.metric_key',
  'from public.research_tasks t',
  'join public.stock_research_memberships m',
  'on m.user_id = t.claimed_owner_id and m.ticker = t.ticker',
  'left join public.orca_research_board_assignments b',
  'on b.task_id = t.id and b.ticker = t.ticker',
  'where t.claimed_owner_id = $1::uuid and t.status = \'claimed\'',
  'and t.claimed_until > clock_timestamp()',
  'and exists (select 1 from public.agent_profiles p',
  'where p.owner_id = $1::uuid and p.opted_in is true)',
  'and ($2::text is null or t.ticker = $2::text)',
  'order by t.claimed_until asc, t.created_at asc, t.id asc limit 1'
].join(' ');
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(){throw Error('owner_scoped_research_unavailable');}
async function one(query,statement,parameters){
  const result=await query(statement,parameters);
  if(!result||!Array.isArray(result.rows)||result.rows.length>1)fail();
  return result.rows[0]||null;
}
function tickerArg(args){
  if(!obj(args)||Object.keys(args).some(k=>k!=='ticker'))fail();
  const t=args.ticker;
  if(t==null)return null;
  if(typeof t!=='string'||!TICKER.test(t.trim().toUpperCase()))fail();
  return t.trim().toUpperCase();
}
function response(id,result){
  return new Response(JSON.stringify({jsonrpc:'2.0',id,result}),{
    status:200,headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'
    }
  });
}
function textTool(value){
  return {content:[{type:'text',text:JSON.stringify(value)}],isError:false};
}
function emptyNotification(){
  return new Response(null,{status:202,headers:{'cache-control':'no-store'}});
}

/**
 * query(sql, values) MUST be a dedicated, SELECT-only, non-BYPASSRLS
 * PostgreSQL connection with explicitly audited column grants. No Supabase
 * service_role, elevated admin RPC, public write surface or DDL rights.
 * A private privilege migration and real DB acceptance are still required.
 */
export function createOwnerScopedResearchDispatcher({query,now=()=>Date.now()}={}){
  if(typeof query!=='function'||typeof now!=='function')
    throw Error('private_read_only_query_required');
  return async function dispatchReadOnly({rpc,ownerId,clientId,grantId}={}){
    if(!UUID.test(ownerId||'')||!UUID.test(grantId||'')||
       typeof clientId!=='string'||!CLIENT.test(clientId)||
       !obj(rpc)||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string')
      fail();
    if(rpc.method==='notifications/initialized'){
      if(Object.hasOwn(rpc,'id'))fail();
      return emptyNotification();
    }
    if(!Object.hasOwn(rpc,'id')||
       !((typeof rpc.id==='string'&&rpc.id.length<=128)||
         (typeof rpc.id==='number'&&Number.isSafeInteger(rpc.id))))
      fail();
    if(rpc.method==='initialize')
      return response(rpc.id,{
        protocolVersion:PROTOCOL,
        capabilities:{tools:{listChanged:false}},
        serverInfo:{name:'orca-owned-research',version:'0.1.0-staging'}
      });
    if(rpc.method==='ping')return response(rpc.id,{});
    if(rpc.method==='tools/list')return response(rpc.id,{tools:DEFINITION});
    if(rpc.method!=='tools/call'||!obj(rpc.params)||
       !['orca_whoami','orca_my_assignment'].includes(rpc.params.name))fail();
    const params=obj(rpc.params.arguments)?rpc.params.arguments:{};
    if(rpc.params.name==='orca_whoami'&&Object.keys(params).length)fail();
    const ticker=rpc.params.name==='orca_my_assignment'?tickerArg(params):null;
    const profile=await one(query,PROFILE_SQL,[ownerId]);
    if(!profile||profile.opted_in!==true)
      return response(rpc.id,textTool({
        schema:'ORCA_OWNER_RESEARCH_V1',status:'permission_required',
        researcher:null,assignment:null
      }));
    if(typeof profile.display_name!=='string'||
       profile.display_name.length<1||profile.display_name.length>60)fail();
    if(rpc.params.name==='orca_whoami')
      return response(rpc.id,textTool({
        schema:'ORCA_OWNER_RESEARCH_V1',status:'ready',
        researcher:profile.display_name,research_enabled:true
      }));
    if(ticker){
      const membership=await one(query,MEMBERSHIP_SQL,[ownerId,ticker]);
      if(!membership)
        return response(rpc.id,textTool({
          schema:'ORCA_OWNER_RESEARCH_V1',status:'team_required',
          ticker,assignment:null
        }));
    }
    const task=await one(query,ASSIGNMENT_SQL,[ownerId,ticker]);
    if(!task)
      return response(rpc.id,textTool({
        schema:'ORCA_OWNER_RESEARCH_V1',status:'no_active_assignment',
        ticker,assignment:null
      }));
    const ms=Date.parse(task.claimed_until||'');
    if(!UUID.test(task.id||'')||!TICKER.test(task.ticker||'')||
       !BOARD.has(task.board_key)||typeof task.research_area!=='string'||
       typeof task.research_question!=='string'||
       !Number.isFinite(ms)||ms<=now())fail();
    if(ticker&&task.ticker!==ticker)fail();
    return response(rpc.id,textTool({
      schema:'ORCA_OWNER_RESEARCH_V1',status:'assigned',
      ticker:task.ticker,assignment:{
        task_id:task.id,ticker:task.ticker,metric:task.research_area,
        question:task.research_question,due_at:new Date(ms).toISOString(),
        board_key:task.board_key
      }
    }));
  };
}
