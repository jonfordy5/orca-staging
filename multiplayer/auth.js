// M1-02B: trusted room-server authentication, never shipped to the browser.
// No service-role key is needed: both reads execute with the caller's real JWT.
const reject = message => { throw new Error(message); };
export function bearerToken(header) {
  if (typeof header !== 'string') return null;
  const m = /^Bearer ([A-Za-z0-9._~+/-]{30,8192})$/.exec(header);
  return m ? m[1] : null;
}
export async function verifyEligibleUser(token, env, fetcher = fetch) {
  if (typeof token !== 'string' || token.length < 30 || token.length > 8192 ||
      !/^[A-Za-z0-9._~+/-]+$/.test(token)) reject('Unauthorized');
  const base = String(env?.ORCA_SUPABASE_URL || '').replace(/\/$/, '');
  const apiKey = String(env?.ORCA_SUPABASE_PUBLISHABLE_KEY || '');
  // Explicitly bind this server to the existing staging project; no arbitrary
  // URL, client-provided project or role key may be used for verification.
  if (base !== 'https://vbziibatnejoswsdggga.supabase.co' || !apiKey) reject('Staging verification not configured');
  const headers = { Authorization: 'Bearer ' + token, apikey: apiKey };
  const authResponse = await fetcher(base + '/auth/v1/user', { method: 'GET', headers });
  if (!authResponse.ok) reject('Unauthorized');
  const user = await authResponse.json();
  if (typeof user?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) reject('Unauthorized');
  const gateResponse = await fetcher(base + '/rest/v1/rpc/orca_legends_access', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!gateResponse.ok) reject('Not eligible');
  const gate = await gateResponse.json();
  if (gate?.allowed !== true || gate.status !== 'eligible') reject('Not eligible');
  return { ownerId: user.id, ticker: typeof gate.ticker === 'string' ? gate.ticker : null };
}
