// Real Orca-staging Edge Function availability and signed-out denials.
// Uses no ORCA accounts, bearer tokens, API keys, research tasks, or writes.
// Never executes an authorized paid generation or publication request.
import assert from 'node:assert/strict';
const base='https://vbziibatnejoswsdggga.supabase.co/functions/v1/';
const functions=[
 'orca-majority-synthesis',
 'orca-timeline-discovery',
 'orca-timeline-photo-fill',
 'orca-auto-ai-profile',
 'orca-ai-profile-pilot',
 'orca-av-ulta-private-preview',
];
for (const slug of functions) {
 const response=await fetch(base+slug,{
  method:'OPTIONS',
  headers:{Origin:'https://jonfordy5.github.io','Access-Control-Request-Method':'POST'},
  signal:AbortSignal.timeout(12000)
 });
 assert.ok(response.status<500,slug+' OPTIONS failed HTTP '+response.status);
 console.log('PASS: '+slug+' responds without server error to unauthenticated preflight (HTTP '+response.status+')');
}
for (const slug of functions.filter(s=>s!=='orca-auto-ai-profile')) {
 const response=await fetch(base+slug,{
  method:slug==='orca-ai-profile-pilot'?'GET':'POST',
  headers:{'Content-Type':'application/json'},
  ...(slug==='orca-ai-profile-pilot'?{}:{body:'{}'}),
  signal:AbortSignal.timeout(12000)
 });
 assert.ok([401,403].includes(response.status),
  slug+' did not deny unauthenticated read/POST: HTTP '+response.status);
 console.log('PASS: '+slug+' rejects signed-out requests (HTTP '+response.status+')');
}
console.log('PASS: staging Edge authentication boundary smoke complete (no signed-in or OAuth client bearer tested).');
