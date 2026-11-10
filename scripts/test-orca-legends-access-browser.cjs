/* Public-origin browser integration for the Vault eligibility flow.
 * Uses the real shipped Supabase SDK and application modules, with isolated
 * synthetic Auth/RPC transport fixtures. This is NOT a real owner's session.
 * Set ORCA_GAME_URL to exercise deployed assets with the same fixture transport.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const projectHost = 'vbziibatnejoswsdggga.supabase.co';
const storageKey = 'sb-vbziibatnejoswsdggga-auth-token';
const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const localAssetOrigin = 'https://orca-access.test';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const base = new URL(process.env.ORCA_GAME_URL || `${localAssetOrigin}/orca-staging/orca-legends-game.html`);
base.searchParams.set('test', '1');
const sourceIsLive = !!process.env.ORCA_GAME_URL;

function sessionFor(id = ownerId, expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -120 : 3600);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', aud: 'authenticated', exp })}.synthetic-browser-test-signature`;
  return {
    access_token: token, refresh_token: 'synthetic-browser-test-refresh-token', token_type: 'bearer',
    expires_at: exp, expires_in: expired ? -120 : 3600,
    user: {
      id, aud: 'authenticated', role: 'authenticated', email: 'synthetic-vault-browser-test@example.invalid',
      app_metadata: { provider: 'email', providers: ['email'] },
      // An editable claim must never substitute for server eligibility.
      user_metadata: { contributor_eligible: true },
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

let browser;
let checks = 0;
const pass = message => { checks++; console.log(`PASS ${message}`); };

async function scenario(options = {}) {
  const state = {
    owner: options.owner || ownerId, signedIn: options.signedIn !== false,
    rpc: options.rpc || { allowed: false, status: 'contribution_required' },
    rpcError: options.rpcError || null, authError: options.authError || null,
    authCalls: 0, rpcCalls: 0, refreshCalls: 0, directTables: [], errors: [], consoleErrors: [],
    requests: [], rpcBodies: [],
  };
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem('orca-legends-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }));
    // Preserve a session created by the real SDK when account.html returns.
    if (!sessionStorage.getItem('orca-vault-synthetic-session-seeded')) {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      sessionStorage.setItem('orca-vault-synthetic-session-seeded', '1');
    }
  }, { key: storageKey, value: state.signedIn ? sessionFor(state.owner, options.expired) : null });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    state.requests.push({ host: url.hostname, path: url.pathname });
    if (url.hostname === projectHost) {
      const cors = { 'access-control-allow-origin': base.origin, 'access-control-allow-headers': 'authorization,apikey,x-client-info,content-type,x-supabase-api-version', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      const reply = response => route.fulfill({ ...response, headers: cors });
      if (request.method() === 'OPTIONS') return reply({ status: 204, body: '' });
      if (url.pathname === '/auth/v1/user') {
        state.authCalls++;
        if (state.authError) return reply({ status: state.authError.status || 401, json: state.authError.body || { code: 'bad_jwt', message: 'Synthetic expired session' } });
        return reply({ status: 200, json: sessionFor(state.owner).user });
      }
      if (url.pathname === '/auth/v1/token') {
        state.refreshCalls++;
        state.signedIn = true;
        return reply({ status: 200, json: sessionFor(state.owner) });
      }
      if (url.pathname === '/rest/v1/rpc/orca_legends_access') {
        state.rpcCalls++;
        assert(['GET', 'POST'].includes(request.method()), 'Eligibility RPC must use a supported SDK read transport.');
        const body = JSON.parse(request.postData() || '{}'); state.rpcBodies.push(body);
        assert.deepEqual(body, {}, 'The caller must not supply an owner ID, alias, or eligibility flag.');
        assert.equal(url.search, '', 'Eligibility RPC must not accept caller identity in query parameters.');
        if (state.rpcError) return reply({ status: state.rpcError.status, json: state.rpcError.body });
        return reply({ status: 200, json: state.rpc });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        state.directTables.push(url.pathname + url.search);
        return reply({ status: 403, json: { code: '42501', message: 'Browser eligibility must not read protected research ownership columns.' } });
      }
      return reply({ status: 404, json: { message: 'Unexpected synthetic transport request' } });
    }
    if (url.hostname === 'esm.sh' && url.pathname.startsWith('/@supabase/supabase-js@2')) {
      // Account historically imports the ESM distribution. Load the identical
      // shipped SDK as a classic script, then expose its real createClient API.
      const sdkUrl = new URL('./game/vendor/supabase.js', base).href;
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': base.origin }, body: `await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=${JSON.stringify(sdkUrl)};script.onload=resolve;script.onerror=reject;document.head.append(script)});export const createClient=window.supabase.createClient;` });
    }
    if (!sourceIsLive && url.origin === localAssetOrigin) {
      const relative = decodeURIComponent(url.pathname).replace(/^\/orca-staging\//, '');
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Test asset not found' });
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') state.consoleErrors.push(entry.text()); });
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  return { state, context, page, close: () => context.close() };
}

async function waitForMessage(page, pattern) {
  await page.waitForFunction(source => {
    const message = document.querySelector('#access-message')?.textContent || '';
    const status = document.querySelector('#access-panel')?.dataset.status;
    return !!status && status !== 'checking' && new RegExp(source, 'i').test(message);
  }, pattern.source, { timeout: 30000 });
}
async function assertLocked(test, messagePattern) {
  await waitForMessage(test.page, messagePattern);
  assert.equal(await test.page.locator('#start-button').isDisabled(), true);
  assert.equal(await test.page.evaluate(() => !!window.__ORCA_TEST__), false, 'A public test query must not bypass entitlement.');
  assert.deepEqual(test.state.directTables, []);
  assert.deepEqual(test.state.errors, []);
}

(async () => {
  const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  // Trust only this managed environment's provided proxy CA for optional live QA.
  if (sourceIsLive && process.env.NODE_EXTRA_CA_CERTS) {
    const { X509Certificate, createHash } = require('node:crypto');
    const ca = new X509Certificate(fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS));
    const pin = createHash('sha256').update(ca.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    args.push('--ignore-certificate-errors-spki-list=' + pin);
  }
  browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args });

  const signedOut = await scenario({ signedIn: false });
  await assertLocked(signedOut, /sign in/);
  assert.equal(signedOut.state.rpcCalls, 0);
  const signIn = new URL(await signedOut.page.locator('.access-links a').filter({ hasText: 'Sign in' }).getAttribute('href'), base);
  assert.equal(signIn.searchParams.get('returnTo'), 'orca-legends-game.html');
  pass('Signed-out public visitor stays locked and gets a Vault-return sign-in link'); await signedOut.close();

  const signInReturn = await scenario({ signedIn: false, rpc: { allowed: true, status: 'eligible', ticker: 'RKLB' } });
  await assertLocked(signInReturn, /sign in/);
  await signInReturn.page.locator('.access-links a').filter({ hasText: 'Sign in' }).click();
  await signInReturn.page.waitForURL(url => url.pathname.endsWith('/account.html'));
  await signInReturn.page.locator('#email').fill('synthetic-vault-browser-test@example.invalid');
  await signInReturn.page.locator('#password').fill('Synthetic-only-not-a-real-password');
  await signInReturn.page.waitForFunction(() => !document.querySelector('#submit')?.disabled);
  await signInReturn.page.locator('#submit').click();
  await signInReturn.page.waitForURL(url => url.pathname.endsWith('/orca-legends-game.html'), { timeout: 30000 });
  await signInReturn.page.waitForFunction(() => !document.querySelector('#start-button')?.disabled, null, { timeout: 90000 });
  assert(signInReturn.state.authCalls > 0, 'The account return must follow server-verified getUser().');
  assert(signInReturn.state.rpcCalls > 0, 'Returning to the Vault must automatically check eligibility.');
  assert.deepEqual(signInReturn.state.directTables, []); assert.deepEqual(signInReturn.state.errors, []);
  pass('Real SDK sign-in persists the account session, automatically returns to the Vault, and rechecks eligibility'); await signInReturn.close();

  for (const [label, options] of [
    ['Signed-in owner without a completed contribution', {}],
    ['Completed task without an accepted publication', { rpc: { allowed: false, status: 'contribution_required' } }],
    ["A different owner's public contribution", { owner: otherOwnerId, rpc: { allowed: false, status: 'contribution_required' } }],
    ['Owner without an authorized researcher profile', { rpc: { allowed: false, status: 'profile_required' } }],
    ['Owner with research permission disabled', { rpc: { allowed: false, status: 'permission_required' } }],
  ]) {
    const denied = await scenario(options);
    await assertLocked(denied, /contribution|mission|profile|permission|authoriz/);
    assert(denied.state.authCalls > 0, 'Identity must be checked by the Auth server.');
    assert(denied.state.rpcCalls > 0, 'Eligibility must be read from the server RPC.');
    pass(`${label} remains locked despite editable browser metadata`); await denied.close();
  }

  for (const [label, rpcError] of [
    ['Protected ownership permission failure', { status: 403, body: { code: '42501', message: 'permission denied for table commons_research_findings' } }],
    ['Missing eligibility RPC in the schema cache', { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.orca_legends_access' } }],
  ]) {
    const failed = await scenario({ rpcError });
    await assertLocked(failed, /verification|eligibility|permission|service|schema|database|unavailable|failed/);
    const message = await failed.page.locator('#access-message').innerText();
    assert(!/complete.*first.*mission/i.test(message), 'A backend verification failure must not tell a qualified owner to repeat a mission.');
    assert(!message.includes('commons_research_findings'), 'Do not expose raw database object details in the UI.');
    pass(`${label} stays locked with a useful verification status`); await failed.close();
  }

  const invalidSession = await scenario({ authError: { status: 401, body: { code: 'bad_jwt', message: 'Synthetic invalid stored session' } } });
  await assertLocked(invalidSession, /sign in|session|authentication/);
  assert.equal(invalidSession.state.rpcCalls, 0);
  pass('An invalid stored session prompts sign-in instead of accusing the owner of missing research'); await invalidSession.close();

  const refresh = await scenario({ expired: true });
  await assertLocked(refresh, /contribution|mission/);
  assert(refresh.state.refreshCalls > 0, 'An expired existing account session must refresh before eligibility checks.');
  assert(refresh.state.authCalls > 0); assert(refresh.state.rpcCalls > 0);
  pass('The real SDK refreshes an expired stored account session before checking eligibility'); await refresh.close();

  const recheck = await scenario();
  await assertLocked(recheck, /contribution|mission/);
  const previous = recheck.state.rpcCalls;
  recheck.state.rpc = { allowed: true, status: 'eligible', ticker: 'RKLB' };
  await recheck.page.locator('[data-action="check-access"]').click();
  await recheck.page.waitForFunction(() => !document.querySelector('#start-button')?.disabled, null, { timeout: 90000 });
  assert(recheck.state.rpcCalls > previous, 'Recheck must perform a fresh server request.');
  assert.match(await recheck.page.locator('#access-message').innerText(), /confirm|eligible|contribution|RKLB/i);
  assert.doesNotMatch(await recheck.page.locator('#access-message').innerText(), /LOCAL.*BYPASS/i);
  assert.deepEqual(recheck.state.directTables, []);
  await recheck.page.waitForFunction(() => window.__ORCA_TEST__);
  await recheck.page.evaluate(() => window.__ORCA_TEST__.manualClock());
  await recheck.page.locator('#start-button').click();
  const snapshot = await recheck.page.evaluate(() => window.__ORCA_TEST__.snapshot());
  assert.equal(snapshot.phase, 'explore'); assert(snapshot.meshes > 100);
  assert.deepEqual(recheck.state.errors, []); assert.deepEqual(recheck.state.consoleErrors, []);
  pass('Recheck recognizes the synthetic eligible RKLB owner, enables Enter, and loads the actual 3D game');
  if (process.env.ORCA_ACCESS_SCREENSHOT) await recheck.page.screenshot({ path: process.env.ORCA_ACCESS_SCREENSHOT });
  await recheck.close();
  console.log(`ALL ${checks} VAULT ACCESS BROWSER CHECKS PASSED (synthetic Auth/RPC sessions; no real owner session claimed)`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
