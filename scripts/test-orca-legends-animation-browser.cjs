/* WO-03 motion integration checks: real keyboard/mouse input in the shipped
 * Babylon scene, with the existing localhost clock/position hooks only. */
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
const near = (actual, expected, label, epsilon = 1e-8) => assert(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`);
const rootMatchesPlayer = state => assert.deepEqual(state.actorPositions.hero, [state.player.x, 0, state.player.z], 'Procedural motion cannot displace the collision root.');

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
  const frames = count => page.evaluate(n => { for (let i = 0; i < n; i++) window.__ORCA_TEST__.step(1 / 60); }, count);
  const position = (x, z, yaw = 0) => page.evaluate(args => window.__ORCA_TEST__.position(...args), [x, z, yaw]);
  const render = () => page.evaluate(() => window.__ORCA_TEST__.render());
  const releaseKeys = async () => { for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyQ', 'KeyF', 'Space']) await page.keyboard.up(key); };
  const restart = async () => {
    await releaseKeys();
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

  await position(-2, -17);
  await page.keyboard.down('KeyW');
  await frames(24);
  let state = await snapshot();
  assert(state.player.z > -16);
  const before = state.player;
  await frames(1);
  state = await snapshot();
  near(state.animation.hero.speed, Math.hypot(state.player.x - before.x, state.player.z - before.z) * 60, 'Animation receives the real last-tick displacement');
  assert(state.animation.hero.phase > 0);
  const walking = state.animation.hero.distance;
  await page.keyboard.down('ShiftLeft');
  await frames(24);
  state = await snapshot();
  assert(state.animation.hero.speed > 5.9);
  assert(state.animation.hero.distance > walking);
  assert(state.player.stamina < 100);
  rootMatchesPlayer(state);
  await releaseKeys();
  await frames(60);
  assert((await snapshot()).animation.hero.moveBlend < .01);
  pass('WASD starts immediately; walking, sprinting and stopping follow actual travel without root drift');

  await restart();
  await position(10, -10);
  await page.keyboard.down('KeyD');
  await frames(60);
  const wall = await snapshot();
  assert(wall.player.x <= 10.53);
  assert(wall.player.vx > 3.4, 'The existing movement intent remains held against masonry.');
  assert(wall.animation.hero.speed < 1e-8, 'Blocked movement has zero actual animation speed.');
  await frames(60);
  state = await snapshot();
  near(state.animation.hero.phase, wall.animation.hero.phase, 'Feet do not cycle while pressing a wall');
  assert(state.animation.hero.moveBlend < .01);
  rootMatchesPlayer(state);
  await releaseKeys();
  pass('Masonry collision stops distance-based footwork even while the movement key stays down');

  await restart();
  await position(-2, -17);
  await page.mouse.move(460, 300);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(600, 300, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  assert(Math.abs((await snapshot()).camera.yaw) > .2);
  await page.keyboard.down('KeyW');
  await frames(24);
  state = await snapshot();
  assert(state.player.x > -1.6 && state.player.z > -16, 'W follows the actual mouse camera heading.');
  near(state.player.yaw, state.camera.yaw, 'Player facing follows movement', .01);
  rootMatchesPlayer(state);
  await releaseKeys();
  pass('Mouse camera and movement produce the existing facing while the rig blends turning visually');

  await restart();
  await position(-2, -17);
  await page.keyboard.down('KeyQ');
  await page.keyboard.down('KeyW');
  await frames(30);
  state = await snapshot();
  assert(state.player.blocking);
  near(state.animation.hero.speed, 2, 'Held shield retains the original movement speed', .01);
  await releaseKeys();
  await page.keyboard.press('KeyR');
  state = await snapshot();
  assert.equal(state.player.action.type, 'heavy');
  near(state.player.stamina, 72, 'Heavy input retains its original cost');
  await page.keyboard.press('KeyF');
  assert.equal((await snapshot()).projectiles, 0, 'An attack still refuses spell input.');
  await page.keyboard.down('KeyW');
  await frames(24);
  state = await snapshot();
  near(state.animation.hero.speed, 1.05, 'Recovery retains the original 30% movement speed', .01);
  await releaseKeys();
  await render();
  pass('Guard and attack locomotion use their original speeds and immediate action rules');

  await restart();
  await position(-2, -17);
  await frames(24);
  await page.keyboard.press('KeyF');
  state = await snapshot();
  assert.equal(state.player.mana, 72);
  assert.equal(state.player.spellCooldown, 3.6);
  assert.equal(state.player.action, null);
  assert.equal(state.player.castAge, 0);
  assert.equal(state.projectiles, 1, 'Cinderbolt launches in the input event.');
  await page.keyboard.down('KeyW');
  await frames(12);
  state = await snapshot();
  assert(state.animation.hero.speed > 3.3, 'Cast follow-through adds no movement lock.');
  rootMatchesPlayer(state);
  await releaseKeys();
  pass('Cinderbolt keeps immediate launch, cost and cooldown while its pose follows movement');

  await restart();
  await position(-2, -12); // Leave the full backward dodge clear of the southern wall.
  await page.keyboard.press('Space');
  state = await snapshot();
  assert.equal(state.player.action.type, 'dodge');
  assert.equal(state.player.stamina, 76);
  await page.keyboard.press('KeyF');
  assert.equal((await snapshot()).projectiles, 0);
  await frames(14);
  state = await snapshot();
  assert.equal(state.player.action.type, 'dodge');
  const dodgeBefore = state.player;
  await frames(1);
  state = await snapshot();
  near(Math.hypot(state.player.x - dodgeBefore.x, state.player.z - dodgeBefore.z) * 60, 9.5, 'Dodge keeps existing displacement speed');
  rootMatchesPlayer(state);
  await frames(14);
  state = await snapshot();
  assert.equal(state.player.action, null);
  rootMatchesPlayer(state);
  await render();
  pass('Space dodges immediately at the original cost, speed and duration without adding a spell cancel');

  await restart();
  await position(0, 5.8);
  for (let i = 0; i < 120 && !(await snapshot()).guardian.action; i++) await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.action.type, 'strike');
  assert.equal(state.guardian.action.windup, .9);
  assert.equal(state.guardian.action.duration, 1.55);
  const health = state.player.health;
  while ((await snapshot()).guardian.action.elapsed + 1 / 60 < .9) await frames(1);
  state = await snapshot();
  assert.equal(state.player.health, health, 'Telegraph motion cannot bring damage forward.');
  assert.equal(state.guardian.action.dealt, false);
  await frames(1);
  state = await snapshot();
  assert.equal(state.guardian.action.dealt, true);
  assert.equal(state.player.health, health - 23);
  assert.deepEqual(state.actorPositions.guardian, [state.guardian.x, 0, state.guardian.z]);
  await render();
  pass('Warden telegraph remains committed until the exact original .9-second contact and 23 damage');

  for (const [quality, reducedMotion] of [['low', false], ['low', true], ['high', true], ['high', false]]) {
    await settings(quality, reducedMotion);
    await restart();
    await position(-2, -17);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await frames(24);
    const moving = await snapshot();
    await page.keyboard.press('Escape');
    const paused = await snapshot();
    await frames(90);
    state = await snapshot();
    assert.deepEqual(state.animation, paused.animation, 'Pause freezes all procedural motion state.');
    assert.deepEqual(state.player, paused.player);
    assert.equal(state.meshes, moving.meshes);
    assert.equal(state.materials, moving.materials);
    await page.locator('[data-action="resume"]').click();
    await render();
    pass(`${quality} / reduced motion ${reducedMotion}: animation pauses exactly and active geometry renders`);
  }

  await restart();
  const resources = await snapshot();
  for (let i = 0; i < 3; i++) {
    await position(-2, -17);
    await page.keyboard.down('KeyW');
    await frames(20);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Space');
    await frames(30);
    await page.keyboard.press('KeyR');
    await frames(58);
    await restart();
    state = await snapshot();
    near(state.animation.hero.phase, 0, 'Restart clears old walk cadence');
    near(state.animation.hero.moveBlend, 0, 'Restart clears old movement blend');
    assert.equal(state.meshes, resources.meshes);
    assert.equal(state.materials, resources.materials);
    assert.equal(state.lights, resources.lights);
    rootMatchesPlayer(state);
  }
  pass('Repeated movement, dodge, attack and restart clear transient motion without growing scene resources');

  await page.mouse.click(480, 300);
  state = await snapshot();
  assert.equal(state.player.action.type, 'light');
  assert.equal(state.player.stamina, 86);
  await frames(14);
  await render();
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /https?:\/\/[^/]*(supabase\.co|api\.openai\.com|api\.anthropic\.com)/.test(url)), false);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(() => !!window.__ORCA_TEST__), false);
  pass('Real left mouse attack remains immediate; all motion paths render without errors or live research calls and dispose cleanly');
  console.log(`ALL ${checks} ORCA LEGENDS ANIMATION BROWSER CHECKS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
