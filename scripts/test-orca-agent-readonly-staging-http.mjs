// Safe internet smoke test of the real *staging* endpoint; no tokens, keys or user data.
// GitHub Actions runs this on a public runner. It must never target production.
import assert from 'node:assert/strict';
import test from 'node:test';

const target = 'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-readonly';
const post = async headers => fetch(target, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ action: 'whoami' }),
  signal: AbortSignal.timeout(15000)
});

test('anonymous caller cannot read profile or assignment via staging endpoint', async () => {
  const response = await post({});
  assert.ok([401,403].includes(response.status),
    `Signed-out staging request must be rejected (status: ${response.status})`);
});

test('malformed fake bearer token cannot impersonate an ORCA researcher', async () => {
  const response = await post({ Authorization: 'Bearer intentionally-invalid-no-user-session' });
  assert.ok([401,403].includes(response.status),
    `Fake token must be rejected (status: ${response.status})`);
});
