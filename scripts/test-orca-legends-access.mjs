import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyContributorAccess } from '../game/access.js';

function account({ auth = { data: { user: { id: 'verified-owner', user_metadata: { allowed: true } } }, error: null }, rpc = { data: { allowed: true, status: 'eligible', ticker: 'NVDA' }, error: null }, authThrow = false, rpcThrow = false } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      auth: { async getUser() { calls.push(['getUser']); if (authThrow) throw new Error('Auth network failure'); return auth; } },
      async rpc(...args) { calls.push(['rpc', ...args]); if (rpcThrow) throw new Error('Private transport diagnostic'); return rpc; },
      from() { assert.fail('Eligibility must not select protected ownership columns or use public aliases.'); },
    },
  };
}

test('verified identity calls only the no-argument current-user RPC and unlocks an eligible response', async () => {
  const fixture = account();
  const result = await verifyContributorAccess(fixture.client);
  assert.deepEqual(fixture.calls, [['getUser'], ['rpc', 'orca_legends_access']]);
  assert.equal(result.allowed, true);
  assert.equal(result.localDemo, false);
  assert.equal(result.status, 'eligible');
  assert.equal(result.ticker, 'NVDA');
  assert.match(result.message, /contribution is recognized/i);
});

test('missing sessions cannot call the eligibility RPC or claim entitlement from local metadata', async () => {
  for (const auth of [
    { data: { user: null }, error: null },
    { data: {}, error: null },
    { data: { user: {} }, error: null },
    { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 401 } },
  ]) {
    const fixture = account({ auth });
    const result = await verifyContributorAccess(fixture.client);
    assert.equal(result.allowed, false);
    assert.equal(result.status, 'signed_out');
    assert.deepEqual(fixture.calls, [['getUser']]);
  }
});

test('expired authentication and unavailable authentication have distinct actionable states', async () => {
  for (const status of [400, 401, 403, 503, 429]) {
    const fixture = account({ auth: { data: { user: null }, error: { name: 'AuthApiError', status, message: 'private-auth-detail' } } });
    const result = await verifyContributorAccess(fixture.client);
    assert.equal(result.allowed, false);
    assert.equal(result.status, [400, 401, 403].includes(status) ? 'session_expired' : 'auth_failed');
    assert.deepEqual(fixture.calls, [['getUser']]);
    assert.doesNotMatch(JSON.stringify(result), /private-auth-detail/);
  }
  const fixture = account({ authThrow: true });
  assert.equal((await verifyContributorAccess(fixture.client)).status, 'auth_failed');
  assert.deepEqual(fixture.calls, [['getUser']]);
});

test('database permission and missing-RPC errors stay query failures with safe diagnostic codes', async () => {
  for (const code of ['42501', 'PGRST202']) {
    const fixture = account({ rpc: { data: null, error: { code, message: 'permission denied for private_schema.contributor_id', details: 'eyJ.private.jwt', hint: 'raw-secret-diagnostic' } } });
    const result = await verifyContributorAccess(fixture.client);
    assert.equal(result.allowed, false);
    assert.equal(result.status, 'query_failed');
    assert.ok(result.message.includes(code));
    assert.match(result.message, /do not repeat your research mission/i);
    assert.doesNotMatch(JSON.stringify(result), /private_schema|contributor_id|eyJ\.|raw-secret/);
  }
  const fixture = account({ rpc: { data: null, error: { code: '42501: eyJ.private.jwt', message: 'raw-server-detail' } } });
  const result = await verifyContributorAccess(fixture.client);
  assert.match(result.message, /UNAVAILABLE/);
  assert.doesNotMatch(JSON.stringify(result), /eyJ\.|raw-server-detail/);
});

test('profile, permission and contribution denials retain the correct next step', async () => {
  for (const [status, expected] of [
    ['signed_out', /sign in/i],
    ['profile_required', /account used for your completed mission/i],
    ['permission_required', /permission is off/i],
    ['contribution_required', /account that owns it/i],
  ]) {
    const fixture = account({ rpc: { data: { allowed: false, status }, error: null } });
    const result = await verifyContributorAccess(fixture.client);
    assert.equal(result.allowed, false);
    assert.equal(result.status, status);
    assert.match(result.message, expected);
  }
});

test('only strict true plus eligible grants access; malformed service responses fail closed', async () => {
  for (const data of [
    null, undefined, [], 'eligible', {},
    { allowed: 'true', status: 'eligible' },
    { allowed: 1, status: 'eligible' },
    { allowed: true },
    { allowed: true, status: 'profile_required' },
    { allowed: false, status: 'eligible' },
    { allowed: false, status: 'unknown_state' },
    { allowed: true, status: 'ELIGIBLE' },
  ]) {
    const fixture = account({ rpc: { data, error: null } });
    const result = await verifyContributorAccess(fixture.client);
    assert.equal(result.allowed, false, JSON.stringify(data));
    assert.equal(result.status, 'query_failed', JSON.stringify(data));
  }
});

test('transport failure after verified sign-in preserves the mission and fails closed', async () => {
  const fixture = account({ rpcThrow: true });
  const result = await verifyContributorAccess(fixture.client);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'query_failed');
  assert.match(result.message, /could not be reached/i);
  assert.match(result.message, /do not repeat your research mission/i);
  assert.doesNotMatch(JSON.stringify(result), /Private transport diagnostic/);
  assert.deepEqual(fixture.calls, [['getUser'], ['rpc', 'orca_legends_access']]);
});
