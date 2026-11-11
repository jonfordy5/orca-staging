/* WO-02 spell regressions in the real Babylon/Chromium scene. All actions,
 * equipment, damage and collision use the shipped game. Only the existing
 * localhost positioning/manual-clock hooks make traversal deterministic. */
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
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
const boundedLight = state => {
  const fx = state.spellFeedback;
  assert(fx.lightIntensity >= 0 && fx.lightIntensity <= 4.2, 'The local light intensity is bounded.');
  assert(fx.lightRange > 0 && fx.lightRange <= 7, 'The spell light has a local, bounded range.');
  assert(fx.lightTargets >= 0 && fx.lightTargets <= 64, 'The local light cannot illuminate an unbounded mesh list.');
  assert.equal(fx.poolLights, 1);
};

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

  const snapshot = () => page.evaluate(() => window.__ORCA_TEST__.snapshot());
  // One exact tick per call avoids step(seconds)' floating-loop rounding at
  // contact/cooldown boundaries. Simulation time never depends on GPU speed.
  const frames = count => page.evaluate(n => { for (let i = 0; i < n; i++) window.__ORCA_TEST__.step(1 / 60); }, count);
  const position = (x, z, yaw = 0) => page.evaluate(args => window.__ORCA_TEST__.position(...args), [x, z, yaw]);
  const action = kind => page.evaluate(name => window.__ORCA_TEST__.action(name), kind);
  const render = async () => {
    await page.evaluate(() => window.__ORCA_TEST__.render());
    assert.deepEqual(errors, [], 'Active spell geometry must render without browser errors.');
  };
  const restart = async () => {
    await page.keyboard.up('KeyF');
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyW');
    if (!(await snapshot()).modal) await page.keyboard.press('Escape');
    await page.locator('[data-action="restart"]').click();
    assert.equal((await snapshot()).phase, 'explore');
  };
  const settings = async (quality, reducedMotion) => {
    if (!(await snapshot()).modal) await page.keyboard.press('Escape');
    await page.locator('[data-setting="quality"]').selectOption(quality);
    await page.locator('[data-setting="reducedMotion"]').setChecked(reducedMotion);
    await page.locator('[data-action="resume"]').click();
  };
  const clearFlightPath = () => position(-2, -17); // >22 from Warden; a clear 27.2-unit northward path.
  const assertIdleFX = state => {
    const fx = state.spellFeedback;
    assert.equal(fx.activeProjectiles, 0);
    assert.equal(fx.activeTrails, 0);
    assert.equal(fx.activeSparks, 0);
    assert.equal(fx.activeImpacts, 0);
    assert.equal(fx.lightIntensity, 0);
  };

  assert.equal((await snapshot()).phase, 'start');
  assert.equal(await action('spell'), false);
  await page.keyboard.press('KeyF');
  assert.equal((await snapshot()).projectiles, 0);
  await page.locator('#start-button').click();
  assert.equal((await snapshot()).phase, 'explore');
  for (const key of ['Escape', 'KeyI']) {
    await page.keyboard.press(key);
    const before = await snapshot();
    await page.keyboard.press('KeyF');
    await frames(12);
    const after = await snapshot();
    assert.equal(after.projectiles, 0);
    assert.equal(after.player.mana, before.player.mana);
    assert.equal(after.player.spellCooldown, before.player.spellCooldown);
    await page.keyboard.press(key);
  }
  pass('F remains unavailable on the start screen, in pause and in inventory');

  await clearFlightPath();
  await frames(24);
  let state = await snapshot();
  assert.equal(state.player.mana, 100, 'Readiness must not spend mana.');
  assert.equal(state.player.spellCooldown, 0, 'Readiness must not start cooldown.');
  assert(state.spellFeedback.chargeVisible && state.spellFeedback.chargeReadiness > .9, 'The ready spell has a visible pre-input charge.');
  boundedLight(state);
  await render();
  await page.keyboard.down('KeyF');
  state = await snapshot();
  assert.equal(state.player.mana, 72);
  assert.equal(state.player.spellCooldown, 3.6);
  assert.equal(state.player.action, null, 'The visual release cannot create a gameplay action lock.');
  assert.equal(state.player.castAge, 0);
  assert.equal(state.projectiles, 1, 'The projectile exists in the same input event as F.');
  assert.equal(state.projectileStates[0].damage, 23);
  assert.equal(state.projectileStates[0].life, 1.6);
  near(state.projectileStates[0].x, -2, 'Immediate projectile x');
  near(state.projectileStates[0].z, -17, 'Immediate projectile z');
  near(Math.hypot(state.projectileStates[0].dx, state.projectileStates[0].dz), 1, 'Projectile direction stays normalized');
  assert.equal(state.spellFeedback.activeProjectiles, 1);
  assert.equal(state.spellFeedback.lastEvent, 'launch');
  assert(state.spellFeedback.lightIntensity > 0);
  await frames(1);
  state = await snapshot();
  near(state.projectileStates[0].z, -17 + 17 / 60, 'Projectile travels at the existing 17 units per second');
  near(state.projectileStates[0].life, 1.6 - 1 / 60, 'Projectile lifetime uses the existing simulation time');
  assert(state.spellFeedback.activeTrails > 0);
  boundedLight(state);
  await render();
  pass('Ready charge precedes input; F immediately releases the same 23-damage, 28-mana, 3.6-second spell at speed 17');

  await frames(94);
  state = await snapshot();
  assert.equal(state.projectiles, 1, 'The clear-path projectile lasts through 95 frames.');
  assert.equal(state.guardian.health, 145);
  await frames(2); // Floating subtraction may expire on tick 96 or 97.
  state = await snapshot();
  assert.equal(state.projectiles, 0);
  assert.equal(state.spellFeedback.lastEvent, 'expired');
  assert.equal(state.guardian.health, 145, 'A lifetime expiry cannot damage the Warden.');
  await frames(118); // 215 total ticks since the cast.
  const beforeCooldown = await snapshot();
  assert(beforeCooldown.player.spellCooldown > 0);
  assert.equal(await action('spell'), false);
  assert.equal((await snapshot()).player.mana, beforeCooldown.player.mana);
  await frames(2);
  assert.equal((await snapshot()).player.spellCooldown, 0);
  await page.keyboard.down('KeyF'); // Browser sends repeat=true while already held.
  assert.equal((await snapshot()).projectiles, 0, 'A held spell key must not buffer or automatically repeat a cast.');
  await page.keyboard.up('KeyF');
  await page.keyboard.press('KeyF');
  assert.equal((await snapshot()).projectiles, 1, 'A fresh press casts immediately when cooldown is ready.');
  pass('Expiry is harmless; cooldown keeps its existing boundary and held F cannot buffer or repeat a cast');

  await restart();
  await clearFlightPath();
  assert.equal(await action('spell'), true);
  assert.equal(await action('heavy'), true, 'Casting cannot add a new melee lock.');
  state = await snapshot();
  assert.equal(state.player.action.type, 'heavy');
  assert.equal(state.player.stamina, 72);
  await restart();
  await clearFlightPath();
  await action('spell');
  await page.keyboard.down('KeyW');
  await frames(6);
  await page.keyboard.up('KeyW');
  state = await snapshot();
  assert.equal(state.player.action, null);
  assert(state.player.z > -16.85, 'The release pose cannot reduce ordinary movement to attack speed.');
  for (const other of ['heavy', 'dodge']) {
    await restart();
    assert.equal(await action(other), true);
    assert.equal(await action('spell'), false);
    state = await snapshot();
    assert.equal(state.player.mana, 100);
    assert.equal(state.player.spellCooldown, 0);
    assert.equal(state.projectiles, 0);
  }
  await restart();
  await clearFlightPath();
  await page.keyboard.down('KeyQ');
  await frames(1);
  assert.equal((await snapshot()).player.blocking, true);
  assert.equal(await action('spell'), true, 'Existing shield-held casting remains usable.');
  await page.keyboard.up('KeyQ');
  pass('Release keeps movement and immediate melee responsive; existing attack, dodge and shield-held cast rules remain intact');

  await restart();
  // The Warden cannot move at this distance. The first sampled point is just
  // outside the original strict one-unit hit radius, then enters it next tick.
  await position(0, 8 - (1 + 17 / 60 + 1e-7));
  await action('spell');
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 145);
  assert.equal(state.projectiles, 1);
  assert(Math.hypot(state.projectileStates[0].x - state.guardian.x, state.projectileStates[0].z - state.guardian.z) > 1);
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 122);
  assert.equal(state.projectiles, 0);
  assert.equal(state.spellFeedback.lastEvent, 'hit');
  assert(state.spellFeedback.activeImpacts > 0 && state.spellFeedback.activeSparks > 0);
  assert(state.spellFeedback.lightIntensity > 0);
  boundedLight(state);
  await render();
  await frames(30);
  state = await snapshot();
  assert.equal(state.guardian.health, 122, 'The new afterglow cannot deal a second hit.');
  assert(state.spellFeedback.activeImpacts > 0, 'A bounded afterglow survives the immediate contact.');
  await render();
  await restart();
  await position(0, 8 - (1 + 17 / 60 - 1e-7));
  await action('spell');
  await frames(1);
  assert.equal((await snapshot()).guardian.health, 122, 'A point just inside one unit hits on the first tick.');
  pass('The unchanged one-unit sampled hit radius deals exactly 23 once, with distinct impact, local light and harmless afterglow');

  await restart();
  await position(0, -14, Math.PI / 2); // The Warden is exactly 22 units away.
  await action('spell');
  state = await snapshot();
  near(state.projectileStates[0].dx, 1, 'At exactly 22 units the original forward-aim rule applies');
  near(state.projectileStates[0].dz, 0, 'At exactly 22 units there is no auto-target turn');
  await restart();
  await position(0, -14 + 1e-6, Math.PI / 2);
  await action('spell');
  state = await snapshot();
  near(state.projectileStates[0].dx, 0, 'Inside 22 units the original Warden auto-target rule applies');
  near(state.projectileStates[0].dz, 1, 'Auto-target still aims toward the Warden');
  pass('The existing strict 22-unit targeting threshold and forward-aim fallback are unchanged');

  await restart();
  await position(-10, 9.45);
  await frames(360); // Real AI follows until its collision radius meets the west brazier.
  state = await snapshot();
  near(state.guardian.x, -4.582075028982237, 'The real Warden follows the deterministic lure');
  near(state.guardian.z, 8.356952593800926, 'The Warden stops against the existing brazier geometry');
  await position(-6.40168349642439, 8.594123471466835);
  await action('spell');
  await frames(2);
  state = await snapshot();
  assert.equal(state.guardian.health, 145);
  const nextPoint = { x: state.projectileStates[0].x + state.projectileStates[0].dx * 17 / 60,
    z: state.projectileStates[0].z + state.projectileStates[0].dz * 17 / 60 };
  assert(Math.hypot(nextPoint.x - state.guardian.x, nextPoint.z - state.guardian.z) < 1);
  assert.equal(await page.evaluate(point => window.__ORCA_TEST__.collision(point.x, point.z, .05), nextPoint), false,
    'The next sampled point intersects both the Warden hit radius and existing masonry.');
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.health, 122, 'Enemy contact must still resolve before wall removal in the same tick.');
  assert.equal(state.spellFeedback.lastEvent, 'hit');
  assert.equal(state.projectiles, 0);
  pass('Real AI and brazier geometry preserve enemy-before-wall resolution on a shared collision tick');

  await restart();
  await position(10, -14, Math.PI / 2);
  await action('spell');
  await frames(4);
  state = await snapshot();
  assert.equal(state.projectiles, 0);
  assert.equal(state.guardian.health, 145);
  assert.equal(state.spellFeedback.lastEvent, 'wall');
  assert(state.spellFeedback.activeImpacts > 0);
  await render();
  pass('A wall consumes the original projectile with a separate harmless fizzle');

  await restart();
  await position(19, .8);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__ORCA_TEST__.snapshot().chests.includes('positioning'));
  await frames(48);
  await page.keyboard.press('KeyI');
  await page.locator('[data-action="select-item"][data-item-id="demo-positioning-star"]').click();
  await page.locator('[data-action="equip"]').click();
  await page.keyboard.press('KeyI');
  state = await snapshot();
  assert.equal(state.equipped.spell, 'demo-positioning-star');
  await position(state.guardian.x, state.guardian.z - 1.2);
  const beforeDemoHit = state.guardian.health;
  assert.equal(await action('spell'), true);
  state = await snapshot();
  assert.equal(state.player.mana, 72);
  assert.equal(state.player.spellCooldown, 3.6);
  assert.equal(state.projectileStates[0].damage, 32);
  assert.equal(state.spellFeedback.activeProjectiles, 0, 'Cinder polish does not replace the demonstration spell.');
  await frames(1);
  assert.equal((await snapshot()).guardian.health, beforeDemoHit - 32);
  pass('The earned demonstration Frontier Star still equips and deals its existing 32 damage with the same mana/cooldown');

  for (const [quality, reducedMotion] of [['high', false], ['low', false], ['high', true], ['low', true]]) {
    await settings(quality, reducedMotion);
    await restart();
    await position(0, 6.8);
    await action('spell');
    state = await snapshot();
    assert.equal(state.player.mana, 72);
    assert.equal(state.player.spellCooldown, 3.6);
    await frames(1);
    state = await snapshot();
    const fx = state.spellFeedback;
    assert.equal(state.guardian.health, 122);
    assert.equal(fx.lastEvent, 'hit');
    assert(fx.activeSparks > 0 && fx.activeSparks <= (reducedMotion ? 2 : quality === 'low' ? 7 : 14));
    assert(fx.activeImpacts > 0);
    if (reducedMotion) {
      assert.equal(fx.activeTrails, 0);
      assert(fx.lightIntensity <= .65, 'Reduced motion uses restrained local illumination.');
      assert.equal(state.feedback.cameraImpulse, 0);
    }
    if (quality === 'low') assert(fx.lightIntensity <= 2.4);
    boundedLight(state);
    await render();
    // A live switch while flight is active must immediately honor trail policy.
    await restart();
    await clearFlightPath();
    await action('spell');
    await frames(1);
    state = await snapshot();
    assert.equal(state.spellFeedback.activeTrails > 0, !reducedMotion);
    await render();
    pass(`${quality} quality / reduced motion ${reducedMotion}: exact mechanics and bounded, renderable spell cues`);
  }

  await settings('high', false);
  await restart();
  await clearFlightPath();
  await action('spell');
  await frames(5);
  await page.keyboard.press('Escape');
  const frozen = await snapshot();
  await page.keyboard.press('KeyF');
  await frames(60);
  state = await snapshot();
  assert.deepEqual(state.projectileStates, frozen.projectileStates);
  assert.deepEqual(state.spellFeedback, frozen.spellFeedback, 'Pause freezes visual timers as well as combat.');
  assert.equal(state.player.mana, frozen.player.mana);
  assert.equal(state.player.spellCooldown, frozen.player.spellCooldown);
  await page.locator('[data-setting="reducedMotion"]').check();
  state = await snapshot();
  assert.equal(state.spellFeedback.activeTrails, 0, 'Enabling reduced motion clears the live ribbon immediately.');
  assert(state.spellFeedback.lightIntensity <= .65);
  await page.locator('[data-action="resume"]').click();
  await frames(1);
  state = await snapshot();
  assert(state.projectileStates[0].life < frozen.projectileStates[0].life);
  await render();
  pass('Pause freezes the flying spell; changing reduced motion applies immediately and resume continues the same projectile');

  await settings('high', false);
  await restart();
  const resources = await snapshot();
  for (let cycle = 0; cycle < 8; cycle++) {
    await position(10, -14, Math.PI / 2);
    assert.equal(await action('spell'), true);
    state = await snapshot();
    assert.equal(state.meshes, resources.meshes + 1, 'Only the pre-existing projectile core is temporary.');
    assert.equal(state.materials, resources.materials + 1);
    assert.equal(state.lights, resources.lights);
    assert.equal(state.spellFeedback.poolMeshes, resources.spellFeedback.poolMeshes);
    assert.equal(state.spellFeedback.poolMaterials, resources.spellFeedback.poolMaterials);
    boundedLight(state);
    await frames(217);
    state = await snapshot();
    assertIdleFX(state);
    assert.equal(state.meshes, resources.meshes);
    assert.equal(state.materials, resources.materials);
    assert.equal(state.lights, resources.lights);
    assert.equal(state.guardian.health, 145);
  }
  state = await snapshot();
  assert(state.player.mana < 28 && state.player.spellCooldown === 0);
  const lowMana = state.player.mana;
  assert.equal(await action('spell'), false, 'Insufficient mana cannot release a visual-only extra projectile.');
  assert.equal((await snapshot()).player.mana, lowMana);
  await restart();
  state = await snapshot();
  assertIdleFX(state);
  assert.equal(state.spellFeedback.lastEvent, null);
  assert.equal(state.meshes, resources.meshes);
  assert.equal(state.materials, resources.materials);
  assert.equal(state.lights, resources.lights);
  assert.equal(state.player.mana, 100);
  assert.equal(state.player.spellCooldown, 0);
  await clearFlightPath();
  await action('spell');
  await frames(3);
  await restart();
  assertIdleFX(await snapshot());
  pass('Repeated casts, expiry and restart preserve pooled resource counts; insufficient mana still blocks release');

  await render();
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /https?:\/\/[^/]*(supabase\.co|api\.openai\.com|api\.anthropic\.com)/.test(url)), false);
  const disposed = await page.evaluate(() => {
    const test = window.__ORCA_TEST__;
    window.dispatchEvent(new Event('pagehide'));
    const state = test.snapshot();
    window.dispatchEvent(new Event('pagehide'));
    return { removed: !window.__ORCA_TEST__, meshes: state.meshes, materials: state.materials, lights: state.lights,
      effects: state.effects, projectiles: state.projectiles, spellFeedback: state.spellFeedback };
  });
  assert.equal(disposed.removed, true);
  for (const key of ['meshes', 'materials', 'lights', 'effects', 'projectiles']) assert.equal(disposed[key], 0);
  assertIdleFX(disposed);
  assert.equal(disposed.spellFeedback.disposed, true);
  assert.deepEqual(errors, []);
  pass('Real rendering reports no console/API errors and idempotent disposal releases spell and scene resources');
  console.log(`ALL ${checks} ORCA LEGENDS SPELL CHECK GROUPS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
