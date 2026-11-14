// ORCA two added staging Edge browser-only guards — real no-token smoke.
// Does not include ORCA account information, JWTs, API keys, research writes,
// stock registrations, or external photo searches. Never tests with real tokens.
import assert from 'node:assert/strict';

const base='https://vbziibatnejoswsdggga.supabase.co/functions/v1/';
const origin='https://jonfordy5.github.io';
for(const slug of ['orca-stock-discovery','orca-unsplash-photo-pilot']){
  const response=await fetch(base+slug,{
    method:'OPTIONS',
    headers:{Origin:origin,'Access-Control-Request-Method':slug==='orca-stock-discovery'?'POST':'GET'},
    redirect:'error',
    signal:AbortSignal.timeout(12000)
  });
  assert.equal(response.status,204,slug+' harmless CORS preflight failed');
  console.log('PASS '+slug+' OPTIONS HTTP '+response.status);
}

// Stock POST with no Origin must fail BEFORE any authentication or stock writes.
const stock=await fetch(base+'orca-stock-discovery',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:'{}',redirect:'error',signal:AbortSignal.timeout(12000)
});
assert.equal(stock.status,403,'Stock registration did not reject untrusted signed-out request');
console.log('PASS stock-discovery anonymous POST HTTP '+stock.status);

// Photo GET with no bearer must fail at the gateway/function before an
// Unsplash key is read or the external paid endpoint is called.
const photo=await fetch(base+'orca-unsplash-photo-pilot?event=ulta-ipo',{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)
});
assert.ok([401,403].includes(photo.status),
  'Photo preview did not reject an unauthenticated request: '+photo.status);
console.log('PASS unsplash-photo-pilot anonymous GET HTTP '+photo.status);
console.log('RESULT: No-token staging smoke passed. OAuth bearer denial and signed-in browser compatibility remain separate real-user tests.');
