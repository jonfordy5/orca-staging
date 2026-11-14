import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isVerifiedOrcaBrowserToken} from '../supabase/functions/_shared/orca-browser-token.ts';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=slug=>readFileSync(join(root,'supabase/functions',slug,'index.ts'),'utf8');
const stock=read('orca-stock-discovery');
const photo=read('orca-unsplash-photo-pilot');

function fnv64(s){
  let h=0xcbf29ce484222325n;
  for(let i=0;i<s.length;i++)h=((h^BigInt(s.charCodeAt(i)))*0x100000001b3n)&0xffffffffffffffffn;
  return h.toString(16).padStart(16,'0');
}
test('Stock code preserves exact original staging v5 logic, aside from OAuth guard',()=>{
  const restored=stock
    .replace('import { isVerifiedOrcaBrowserToken } from "../_shared/orca-browser-token.ts";\n','')
    .replace('\n if(!isVerifiedOrcaBrowserToken(token,user.id))return respond(403,{error:"Linked AI clients cannot register stocks through this website endpoint"},origin);','');
  assert.equal(restored.length,6597);
  assert.equal(fnv64(restored),'856c3291d6208d17');
});
test('Unsplash preview preserves exact original staging v1 logic, aside from OAuth verification',()=>{
  const added=[
    '// Pilot photo preview uses a paid third-party quota. A linked read-only AI',
    '// must never spend that quota using a website-only bearer.',
    'const supabaseAuth=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_ANON_KEY")||"",{',
    '  auth:{persistSession:false,autoRefreshToken:false}',
    '});'
  ].join('\n')+'\n';
  const check=[
    '  const raw=request.headers.get("Authorization")||"";',
    '  const token=/^Bearer\\s+(\\S+)$/i.exec(raw)?.[1]||"";',
    '  if(token.split(".").length!==3)return new Response(JSON.stringify({error:"Sign in to preview photos"}),{status:401,headers});',
    '  const checked=await supabaseAuth.auth.getUser(token);',
    '  const user=checked.data?.user,authError=checked.error;',
    '  if(authError||!user)return new Response(JSON.stringify({error:"Session expired"}),{status:401,headers});',
    '  if(!isVerifiedOrcaBrowserToken(token,user.id))return new Response(JSON.stringify({error:"Linked AI clients cannot use this photo preview"}),{status:403,headers});'
  ].join('\n')+'\n';
  const restored=photo
    .replace('import { createClient } from "npm:@supabase/supabase-js@2.57.0";\n','')
    .replace('import { isVerifiedOrcaBrowserToken } from "../_shared/orca-browser-token.ts";\n','')
    .replace(added,'').replace(check,'');
  assert.equal(restored.length,2437);
  assert.equal(fnv64(restored),'abd5ba1462ac04db');
});
test('Stock POST is identity-verified and OAuth-denied before any profile read or service-role write',()=>{
  assert.match(stock,/from "\.\.\/_shared\/orca-browser-token\.ts"/);
  const code=stock.slice(stock.indexOf('if(req.method!=="POST")'));
  const user=code.indexOf('admin.auth.getUser(token)');
  const deny=code.indexOf('isVerifiedOrcaBrowserToken(token,user.id)');
  const profile=code.indexOf('.from("agent_profiles")');
  const write=code.indexOf('.upsert(');
  assert.ok(user>=0&&deny>user&&profile>deny&&write>deny);
  assert.match(code.slice(deny,deny+200),/return respond\(403/);
});
test('Unsplash checks Supabase user and OAuth type before consuming external search quota',()=>{
  assert.match(photo,/from "\.\.\/_shared\/orca-browser-token\.ts"/);
  const code=photo.slice(photo.indexOf('Deno.serve('));
  const user=code.indexOf('supabaseAuth.auth.getUser(token)');
  const deny=code.indexOf('isVerifiedOrcaBrowserToken(token,user.id)');
  const key=code.indexOf('Deno.env.get("UNSPLASH_ACCESS_KEY")');
  const fetchCall=code.indexOf('await fetch(');
  assert.ok(user>=0&&deny>user&&key>deny&&fetchCall>deny);
  assert.match(photo,/SUPABASE_ANON_KEY/);
  assert.doesNotMatch(photo,/SUPABASE_SERVICE_ROLE_KEY|service_role/);
});
test('Shared browser guard passes existing website identities but rejects OAuth client_id',()=>{
  const owner='11111111-2222-4333-8444-555555555555';
  const jwt=x=>[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify(x)).toString('base64url'),'synthetic'].join('.');
  assert.equal(isVerifiedOrcaBrowserToken(jwt({sub:owner,role:'authenticated'}),owner),true);
  assert.equal(isVerifiedOrcaBrowserToken(jwt({sub:owner,role:'authenticated',client_id:'linked-agent'}),owner),false);
});
