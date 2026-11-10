/* WO-01 combat presentation regressions in the real Babylon scene.
 * Uses existing localhost-only controls/time/position hooks. Combat resolution
 * and settings use the shipped game; no health, guard, or timing mutations.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(error ? 'Not found' : data);
  });
});
let browser;
let checks = 0;
const pass = message => { checks++; console.log('PASS', message); };
const eventKind = state => typeof state.feedback.lastEvent === 'string' ? state.feedback.lastEvent : state.feedback.lastEvent?.kind;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => localStorage.setItem('orca-legends-settings', JSON.stringify({ quality: 'high', volume: 0, reducedMotion: false })));
  await page.goto(`http://127.0.0.1:${server.address().port}/orca-legends-game.html?test=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ORCA_TEST__, null, { timeout: 90000 });
  await page.evaluate(() => window.__ORCA_TEST__.manualClock());
  await page.locator('#start-button').click();

  const snapshot = () => page.evaluate(() => window.__ORCA_TEST__.snapshot());
  // One exact simulation tick per invocation avoids floating-loop rounding in
  // step(seconds), so contact boundaries are checked on adjacent 60 Hz frames.
  const frames = count => page.evaluate(n => { for (let i = 0; i < n; i++) window.__ORCA_TEST__.step(1 / 60); }, count);
  const position = (x, z, yaw = 0) => page.evaluate(args => window.__ORCA_TEST__.position(...args), [x, z, yaw]);
  const action = kind => page.evaluate(name => window.__ORCA_TEST__.action(name), kind);
  const contact = damage => page.evaluate(value => window.__ORCA_TEST__.enemyHit(value), damage);
  const restart = async () => {
    await page.keyboard.up('KeyQ');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="restart"]').click();
    assert.equal((await snapshot()).phase, 'explore');
  };
  const settings = async (quality, reducedMotion) => {
    await page.keyboard.press('Escape');
    await page.locator('[data-setting="quality"]').selectOption(quality);
    await page.locator('[data-setting="reducedMotion"]').setChecked(reducedMotion);
    await page.locator('[data-action="resume"]').click();
  };
  const prepareUnguarded = async () => {
    await restart();
    await frames(48); // The existing initial guard time slice has passed.
    await position(0, 5.8);
  };

  await prepareUnguarded();
  assert.equal(await action('light'), true);
  let state = await snapshot();
  assert.equal(state.player.stamina, 86);
  assert.equal(state.guardian.health, 145);
  await frames(13);
  state = await snapshot();
  assert.equal(state.guardian.health, 145, 'Light damage cannot precede .22s.');
  assert.equal(state.player.action.dealt, false);
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 128, 'Starter light contact still deals exactly 17.');
  assert.equal(state.player.action.dealt, true);
  assert.equal(state.player.stamina, 86);
  assert.equal(await action('light'), false, 'Recovery cannot be cancelled by another strike.');
  const lightFeedback = state.feedback;
  assert(state.feedback.activeFlashes > 0);
  assert(state.feedback.activeSparks > 0);
  assert(state.guardian.reaction.remaining > 0);
  assert(state.guardian.reaction.z > 0, 'Defender flinches away from the attacker.');
  assert.deepEqual(state.actorPositions.guardian, [state.guardian.x, 0, state.guardian.z]);
  assert.equal(state.guardian.x, 0);
  assert.equal(state.guardian.z, 8, 'Visual recoil cannot push collision coordinates.');
  await frames(21);
  assert.equal((await snapshot()).player.action, null);
  pass('Light keeps exact cost, contact boundary, damage and recovery; directional recoil stays visual');

  await prepareUnguarded();
  assert.equal(await action('heavy'), true);
  assert.equal((await snapshot()).player.stamina, 72);
  await frames(28);
  state = await snapshot();
  assert.equal(state.guardian.health, 145, 'Heavy damage cannot precede .48s.');
  assert.equal(state.player.action.dealt, false);
  assert(state.feedback.trailActive, 'The heavy release has a short weapon trail.');
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 117, 'Starter heavy contact still deals exactly 28.');
  assert.equal(state.player.stamina, 72);
  assert.equal(state.player.action.dealt, true);
  await frames(1); // The damped pulse starts at zero at the exact contact instant.
  assert((await snapshot()).feedback.cameraImpulse > lightFeedback.cameraImpulse, 'Heavy contact has a stronger bounded camera pulse.');
  assert(state.guardian.reaction.strength > 1);
  assert.equal(await action('heavy'), false);
  await frames(27);
  assert.equal((await snapshot()).player.action, null);
  pass('Heavy keeps its longer windup, exact cost and damage while strengthening release and contact feedback');

  await restart();
  await action('heavy'); // Default spawn is far outside melee range.
  await frames(29);
  state = await snapshot();
  assert.equal(state.guardian.health, 145);
  assert.equal(state.feedback.activeSparks, 0);
  assert.equal(state.feedback.activeFlashes, 0);
  assert.equal(state.feedback.cameraImpulse, 0, 'A missed strike must not produce contact shake.');
  assert.equal(eventKind(state), 'miss');
  pass('Misses retain sword motion without hit sparks, damage or camera impact');

  await restart();
  await position(0, 5.8);
  await frames(1);
  assert.equal((await snapshot()).guardian.guard, true);
  await action('light');
  await frames(14);
  state = await snapshot();
  assert.equal(state.guardian.health, 140, 'Guarded starter light retains its 30% rounded damage.');
  assert.equal(eventKind(state), 'block');
  assert(state.feedback.activeFlashes > 0);
  await restart();
  await position(0, 5.8);
  await frames(1);
  assert.equal((await snapshot()).guardian.guard, true);
  await action('heavy');
  await frames(29);
  state = await snapshot();
  assert.equal(state.guardian.health, 117);
  assert(state.guardian.stagger > 0);
  assert.equal(eventKind(state), 'guard-break');
  pass('Enemy guard distinguishes a reduced light clash from a full heavy guard-break');

  await restart();
  await position(0, 3.2);
  await page.keyboard.down('KeyQ');
  await frames(22);
  await contact(20);
  state = await snapshot();
  assert.equal(state.player.health, 89);
  assert.equal(state.player.stamina, 90);
  assert.equal(eventKind(state), 'block');
  assert(state.player.reaction.remaining > 0);
  pass('Held shield preserves mitigation and stamina cost with a readable clash reaction');

  await restart();
  await position(0, 3.2);
  await page.keyboard.down('KeyQ');
  await frames(1);
  await contact(20);
  state = await snapshot();
  assert.equal(state.player.health, 100);
  assert.equal(state.player.stamina, 94);
  assert.equal(state.guardian.action, null);
  assert.equal(state.guardian.stagger, 1.2);
  assert.equal(eventKind(state), 'parry');
  await frames(1);
  assert((await snapshot()).feedback.cameraImpulse > 0);
  assert(state.guardian.reaction.remaining > 0);
  assert.match(await page.locator('#toasts').innerText(), /PERFECT PARRY/);
  pass('A timed parry costs six stamina, prevents damage and opens the same stagger window');

  await restart();
  await position(0, 3.2);
  await page.keyboard.down('KeyQ');
  await frames(22);
  for (let i = 0; i < 10; i++) await contact(1);
  assert.equal((await snapshot()).player.stamina, 0);
  const beforeBreak = (await snapshot()).player.health;
  await contact(20);
  state = await snapshot();
  assert.equal(state.player.health, beforeBreak - 20);
  assert.equal(eventKind(state), 'guard-break');
  pass('Exhausted guard still takes full damage and uses a distinct guard-break cue');

  await settings('low', true);
  await restart();
  await frames(48);
  await position(0, 5.8);
  await action('heavy');
  await frames(28);
  state = await snapshot();
  assert.equal(state.feedback.trailActive, false);
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 117);
  assert.equal(state.feedback.cameraImpulse, 0);
  assert(state.feedback.activeSparks <= 4, 'Reduced-motion contacts must use the small spark budget.');
  assert(state.feedback.activeFlashes > 0, 'Contact stays readable with reduced motion.');
  pass('Performance and reduced-motion settings preserve combat with no camera pulse or moving trail');

  await settings('high', false);
  await restart();
  const resources = await snapshot();
  for (let cycle = 0; cycle < 3; cycle++) {
    await position(0, 3.2);
    await page.keyboard.down('KeyQ');
    await frames(1);
    for (let i = 0; i < 12; i++) await contact(20);
    state = await snapshot();
    assert.equal(state.player.health, 100);
    assert.equal(state.feedback.poolMeshes, resources.feedback.poolMeshes);
    assert.equal(state.feedback.poolMaterials, resources.feedback.poolMaterials);
    assert(state.feedback.activeSparks <= state.feedback.poolMeshes);
    assert.equal(state.meshes, resources.meshes, 'Overlapping parries reuse meshes instead of allocating contact meshes.');
    assert.equal(state.materials, resources.materials, 'Overlapping parries reuse contact materials.');
    await page.keyboard.up('KeyQ');
    await frames(60);
    state = await snapshot();
    assert.equal(state.feedback.activeSparks, 0);
    assert.equal(state.feedback.activeFlashes, 0);
    assert.equal(state.feedback.trailActive, false);
    assert.equal(state.feedback.cameraImpulse, 0);
    await restart();
    state = await snapshot();
    assert.equal(state.feedback.activeSparks, 0);
    assert.equal(state.feedback.activeFlashes, 0);
    assert.equal(state.feedback.cameraImpulse, 0);
    assert.equal(state.meshes, resources.meshes);
    assert.equal(state.materials, resources.materials);
  }
  pass('Repeated overlapping contacts, effect expiry and restart keep pooled scene resources bounded');

  // Render the integrated high-quality scene once: this catches shader/geometry
  // errors that pure manual simulation would leave undetected.
  await page.evaluate(() => window.__ORCA_TEST__.render());
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /https?:\/\/[^/]*(supabase\.co|api\.openai\.com|api\.anthropic\.com)/.test(url)), false);
  const disposed = await page.evaluate(() => {
    const test = window.__ORCA_TEST__;
    window.dispatchEvent(new Event('pagehide'));
    const state = test.snapshot();
    window.dispatchEvent(new Event('pagehide'));
    return { removed: !window.__ORCA_TEST__, meshes: state.meshes, materials: state.materials, effects: state.effects, projectiles: state.projectiles };
  });
  assert.deepEqual(disposed, { removed: true, meshes: 0, materials: 0, effects: 0, projectiles: 0 });
  assert.deepEqual(errors, []);
  pass('Real rendering and idempotent page disposal report no errors and release scene resources');
  console.log(`ALL ${checks} ORCA LEGENDS COMBAT FEEDBACK CHECK GROUPS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
