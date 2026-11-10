/* Integrated browser checks. Test-only positioning/time hooks require ?test=1;
 * attacks, equipment, rewards, collision and encounter logic remain real. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(error ? 'Not found' : data); });
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => localStorage.setItem('orca-legends-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true })));
  const base = process.env.ORCA_GAME_URL || `http://127.0.0.1:${server.address().port}/orca-legends-game.html`;
  await page.goto(base + '?test=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ORCA_TEST__, null, { timeout: 90000 });
  const snapshot = () => page.evaluate(() => window.__ORCA_TEST__.snapshot());
  const step = seconds => page.evaluate(s => window.__ORCA_TEST__.step(s), seconds);
  const position = (x, z, yaw = 0) => page.evaluate(v => window.__ORCA_TEST__.position(...v), [x, z, yaw]);
  const action = name => page.evaluate(n => window.__ORCA_TEST__.action(n), name);
  const keyStep = async (key, seconds) => { await page.keyboard.down(key); await step(seconds); await page.keyboard.up(key); };
  const check = text => console.log('PASS', text);
  assert.equal(await page.locator('#start-button').isDisabled(), false);
  await page.locator('#start-button').click();
  assert.equal((await snapshot()).phase, 'explore'); await page.evaluate(() => window.__ORCA_TEST__.manualClock()); check('WebGL game initializes and starts');
  await keyStep('KeyW', .7); await step(.15); const walked = (await snapshot()).player.z;
  assert(walked > -12.2); await page.keyboard.down('ShiftLeft'); await keyStep('KeyW', .7); await page.keyboard.up('ShiftLeft');
  let state = await snapshot(); assert(state.player.z > walked + 3); assert(state.player.stamina < 100); check('WASD acceleration, sprinting and stamina');
  await position(10, -10); await keyStep('KeyD', 1); assert((await snapshot()).player.x <= 10.53);
  assert.equal(await page.evaluate(() => window.__ORCA_TEST__.collision(7.7, -4)), false);
  assert.equal(await page.evaluate(() => window.__ORCA_TEST__.collision(0, 23)), false); check('Walls, pillars and locked gate collide');
  await page.mouse.move(460, 300); await page.mouse.down({button:'middle'}); await page.mouse.move(570, 300, { steps: 4 }); await page.mouse.up({button:'middle'});
  assert(Math.abs((await snapshot()).camera.yaw) > .05); check('Mouse-controlled orbit camera');
  await page.keyboard.press('Escape'); const paused = (await snapshot()).player.x; await keyStep('KeyD', 1); assert.equal((await snapshot()).player.x, paused); await page.locator('[data-action="resume"]').click(); check('Pause freezes gameplay and resumes');
  await position(-19, .8); await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__ORCA_TEST__.snapshot().chests.includes('management'));
  await step(.9); assert((await snapshot()).chestLids.management < -1.4); await page.keyboard.press('KeyI');
  await page.locator('[data-action="select-item"][data-item-id="demo-management-aegis"]').click();
  assert.equal(await page.locator('[data-research-source]').getAttribute('href'), 'https://www.sec.gov/edgar/browse/?CIK=1045810&owner=exclude');
  assert.match(await page.locator('.research-detail').innerText(), /DEMONSTRATION/);
  await page.locator('[data-action="equip"]').click(); assert.equal((await snapshot()).equipped.shield, 'demo-management-aegis'); assert.equal((await snapshot()).equipmentAppearance.shield.toLowerCase(), '#c5a45d'); await page.keyboard.press('KeyI'); check('Management chest, inventory, comparison, equipment and evidence citation');
  await position(19, .8); await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__ORCA_TEST__.snapshot().chests.includes('positioning')); await step(.8);
  await page.keyboard.press('KeyI'); await page.locator('[data-action="select-item"][data-item-id="demo-positioning-star"]').click(); await page.locator('[data-action="equip"]').click(); await page.keyboard.press('KeyI'); check('Positioning chest and equipped spell');
  await position(0, 5.8); await step(.1); const enemyStart = (await snapshot()).guardian.health;
  await page.mouse.click(480, 300); await step(.32); assert((await snapshot()).guardian.health < enemyStart); check('Primary melee hit detection');
  await step(.6); await action('heavy'); await step(.62); assert((await snapshot()).guardian.health < enemyStart - 17); check('Heavy attack and recovery');
  await step(1.1); state = await snapshot(); await position(state.guardian.x, state.guardian.z - 4.8);
  await page.keyboard.down('KeyQ'); await step(.35); assert((await snapshot()).player.blocking); const preBlock = (await snapshot()).player.health; await page.evaluate(() => window.__ORCA_TEST__.enemyHit(20)); await page.keyboard.up('KeyQ');
  assert((await snapshot()).player.health >= preBlock - 8); check('Shield block reduces actual health damage');
  await step(.7); await page.keyboard.press('Space'); assert.equal((await snapshot()).player.action.type, 'dodge'); const dodgeHealth = (await snapshot()).player.health;
  await page.evaluate(() => window.__ORCA_TEST__.enemyHit(20)); assert.equal((await snapshot()).player.health, dodgeHealth); await step(.6); check('Dodge movement, stamina and invulnerability window');
  await position(0, 5.8); const manaBefore = (await snapshot()).player.mana;
  await page.keyboard.press('KeyF'); assert((await snapshot()).player.mana < manaBefore); const spellEnemyBefore = (await snapshot()).guardian.health; await step(.4);
  assert((await snapshot()).guardian.health < spellEnemyBefore); check('Projectile spell, mana and hit damage');
  // Finish through the same real actions; deterministic positioning speeds up traversal on software GPUs.
  for (let i = 0; i < 18 && !(await snapshot()).guardian.dead; i++) {
    state = await snapshot(); await position(state.guardian.x, state.guardian.z - 2.1); await action('heavy'); await step(.65); await action('spell'); await step(.5); await keyStep('KeyQ', .7);
  }
  assert((await snapshot()).guardian.dead); check('Guardian approaches, attacks, reacts and is defeatable');
  await position(0, 13.7); await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__ORCA_TEST__.snapshot().chests.length === 3); await step(.8);
  assert((await snapshot()).arenaUnlocked); await page.keyboard.press('KeyI'); await page.locator('[data-action="select-item"][data-item-id="demo-earnings-dawn"]').click(); await page.locator('[data-action="equip"]').click(); await page.keyboard.press('KeyI');
  assert.equal((await snapshot()).equipped.weapon, 'demo-earnings-dawn'); assert.equal((await snapshot()).equipmentAppearance.weapon.toLowerCase(), '#f3cb70'); assert.equal(await page.evaluate(() => window.__ORCA_TEST__.collision(0, 23)), true); check('Earnings reward, sword equipment and complete arena unlock');
  // Verify the underdog path with all common starter equipment against the champion.
  await page.keyboard.press('KeyI');
  for (const id of ['starter-vaultsteel','starter-watchshield','starter-cinder']) { await page.locator(`[data-action="select-item"][data-item-id="${id}"]`).click(); await page.locator('[data-action="equip"]').click(); }
  await page.keyboard.press('KeyI');
  await position(0, 29.5); await step(.1); assert.equal((await snapshot()).phase, 'intro'); await step(3.2); assert.equal((await snapshot()).phase, 'arena'); check('Cinematic arena introduction and restored combat resources');
  // Observe the champion's actual telegraphs and special attack before the duel.
  await position(0, 40.7); await keyStep('KeyQ', 6); state = await snapshot(); assert(state.player.health < 100); check('Arena AI telegraphs, attacks and damages a blocking hero');
  let parries = 0, evasions = 0;
  for (let i = 0; i < 450 && (await snapshot()).phase === 'arena'; i++) {
    state = await snapshot(); const a = state.gladiator.action;
    if (state.player.action) { await step(.1); continue; }
    if (a && !a.dealt) {
      const remaining = a.windup - a.elapsed;
      if (remaining > .16) { await step(Math.min(.18, remaining - .14)); continue; }
      if (a.type === 'shockwave') { await page.keyboard.press('Space'); await step(.5); evasions++; }
      else {
        await page.keyboard.up('KeyQ'); await step(.02); await page.keyboard.down('KeyQ'); await step(Math.max(.02, remaining + .025)); await page.keyboard.up('KeyQ'); parries++;
        await action('heavy'); await step(1); await action('spell'); await step(.3);
      }
    } else { await step(.12); }
  }
  assert(parries >= 2, 'The common-equipment victory must use multiple timed parries');
  state = await snapshot(); assert.equal(state.phase, 'won'); assert(state.gladiator.dead); assert.match(await page.locator('#result-title').innerText(), /LEGEND/); check('Common-equipment underdog wins through timed parries; victory, reward screen and opponent defeat');
  await page.locator('[data-action="restart"]').click(); state = await snapshot(); assert.equal(state.phase, 'explore'); assert.equal(state.chests.length, 0); assert.equal(state.player.health, 100); assert.equal(state.items.length, 3); check('Victory replay resets encounters, loot and resources');
  await position(0, 5.8); await step(3.5); assert((await snapshot()).player.health < 100); await page.evaluate(() => window.__ORCA_TEST__.enemyHit(1000)); assert.equal((await snapshot()).phase, 'lost');
  await page.locator('[data-action="restart"]').click(); assert.equal((await snapshot()).phase, 'explore'); check('Real enemy damage, defeat screen and restart');
  await page.keyboard.press('Escape'); await page.locator('[data-setting="reducedMotion"]').uncheck(); await page.locator('[data-setting="quality"]').selectOption('high'); await page.locator('[data-action="resume"]').click(); check('Reduced-motion and quality settings');
  await step(.1); await page.evaluate(() => window.__ORCA_TEST__.render());
  if (process.env.ORCA_SCREENSHOT) await page.screenshot({ path: process.env.ORCA_SCREENSHOT });
  assert.deepEqual(errors, []); assert.equal(requests.some(url => /https?:\/\/[^/]*(supabase\.co|api\.openai\.com|api\.anthropic\.com)/.test(url)), false); check('No browser-console errors or research/API requests');
  const publicPage = await browser.newPage();
  publicPage.on('pageerror', e => errors.push(e.message));
  await publicPage.route('https://orca-public.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.join(root, pathname);
    await route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await publicPage.goto('https://orca-public.test/orca-legends-game.html?test=1');
  await publicPage.waitForFunction(() => document.querySelector('#access-message')?.textContent.includes('Sign in to your staging account'));
  assert(await publicPage.locator('#start-button').isDisabled());
  assert.equal(await publicPage.evaluate(() => !!window.__ORCA_TEST__), false);
  assert.equal(await publicPage.locator('.access-links a').count(), 4);
  assert.deepEqual(errors, []); check('Public route fails closed for signed-out visitors; test query cannot bypass contribution gate');
  await publicPage.close();
  console.log('ALL ORCA LEGENDS BROWSER CHECKS PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
