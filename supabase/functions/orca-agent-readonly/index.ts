// Staging candidate: a read-only, signed-in ORCA research status endpoint.
// NOT an OpenAI MCP/OAuth endpoint. Never treat a browser JWT as a ChatGPT agent connection.
// Do not deploy until independently authorized and browser/owner-isolation tested.
//
// Uses only the public/publishable Supabase key with the verified end-user JWT;
// never a service-role key or admin client. The project gateway must use verify_jwt=true.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { normalizeStockTicker, readAgentState } from './policy.mjs';

const siteOrigin = 'https://jonfordy5.github.io';
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, private',
  'Vary': 'Origin',
  'Access-Control-Allow-Origin': siteOrigin,
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond(405, { status: 'method_not_allowed' });

  const bearer = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(bearer)) return respond(401, { status: 'sign_in_required' });
  const token = bearer.slice(7);
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!projectUrl || !publishableKey) return respond(503, { status: 'unavailable' });
  try {
    // Verify against Supabase Auth, not unverified JWT payload / client-provided user ID.
    const client = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const identity = await client.auth.getUser(token);
    if (identity.error || !identity.data?.user?.id) {
      return respond(401, { status: 'sign_in_required' });
    }

    const raw = await req.text();
    if (raw.length > 1024) return respond(413, { status: 'request_too_large' });
    let body;
    try { body = JSON.parse(raw); } catch { return respond(400, { status: 'invalid_request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respond(400, { status: 'invalid_request' });
    }
    if (!['whoami', 'my_assignment'].includes(body.action)) {
      return respond(400, { status: 'unsupported_action' });
    }
    let ticker;
    if (body.action === 'my_assignment') {
      try { ticker = normalizeStockTicker(body.ticker); }
      catch { return respond(400, { status: 'invalid_ticker' }); }
    }
    // All reads use the signed-in user's Supabase identity + existing RLS/RPCs.
    const result = await readAgentState(client, identity.data.user.id, { ticker });
    return respond(200, result);
  } catch {
    // Do not return table names, JWTs, profile IDs, network error bodies, or raw SQL.
    return respond(503, { status: 'read_only_status_unavailable' });
  }
});
