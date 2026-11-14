// Secret-free staging HTTP smoke test. Only public, read-only GET requests.
// The public project URL and publishable key are read from the website's
// already-public staging configuration file; never print the key or data rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config=readFileSync(new URL('../orca-staging-config.js',import.meta.url),'utf8');
const readLiteral=name=>{
  const prefix="const "+name+" = '";
  const line=config.split('\n').find(x=>x.startsWith(prefix));
  if(!line)throw Error('Expected public staging configuration not found: '+name);
  const value=line.slice(prefix.length);
  if(!value.endsWith("';"))throw Error('Unexpected staging configuration literal');
  return value.slice(0,-2);
};
const url=readLiteral('ORCA_STAGING_PROJECT_URL');
const key=readLiteral('ORCA_STAGING_PUBLISHABLE_KEY');
assert.equal(url,'https://vbziibatnejoswsdggga.supabase.co');
assert.ok(key.startsWith('sb_publishable_'));

const cases=[
  {name:'public stocks', path:'/rest/v1/stocks?select=ticker&limit=1'},
  {name:'public findings',path:'/rest/v1/commons_research_findings?select=id&limit=1'}
];

for(const c of cases){
 const response=await fetch(url+c.path,{
  method:'GET',
  headers:{apikey:key,Accept:'application/json'},
  signal:AbortSignal.timeout(12000)
 });
 // Do not log response payloads or project keys.
 assert.equal(response.status,200, c.name+' GET failed: HTTP '+response.status);
 const data=await response.json();
 assert.ok(Array.isArray(data),c.name+' did not return an array');
 console.log('PASS '+c.name+': authenticated gateway allows anonymous GET (HTTP 200)');
}
console.log('PASS: live Orca-staging public REST reads work with PostgREST filter active');
