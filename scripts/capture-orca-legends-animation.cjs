/* WO-03 evidence from actual keyboard/mouse input and the real Babylon scene.
 * Test hooks only position actors, advance fixed time, snapshot and render.
 * Offline video uses original screenshot frames; it is not a live FPS sample. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const checkout = path.resolve(__dirname, '..');
const root = path.resolve(process.env.ANIMATION_CAPTURE_ROOT || checkout);
const output = path.resolve(process.env.CAPTURE_DIR || path.join(checkout, 'work/wo-03-capture'));
const frameDirectory = path.join(output, 'frames');
const enemiesOnly = Boolean(process.env.CAPTURE_ENEMIES_ONLY);
const video = process.env.CAPTURE_VIDEO !== '0' && !enemiesOnly;
const stillsOnly = Boolean(process.env.CAPTURE_STILLS_ONLY) || enemiesOnly;
const captureFps = 15;
const stepSeconds = 4 / 60;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };
const pick = (object, fields) => Object.fromEntries(fields.filter(field => object?.[field] !== undefined).map(field => [field, object[field]]));
const captureState = state => ({
  phase: state.phase,
  player: pick(state.player, ['x', 'z', 'yaw', 'vx', 'vz', 'health', 'stamina', 'mana', 'action', 'blocking', 'castAge', 'spellCooldown']),
  guardian: pick(state.guardian, ['x', 'z', 'health', 'action', 'guard', 'stagger', 'reaction']),
  gladiator: pick(state.gladiator, ['x', 'z', 'health', 'action']),
  camera: state.camera,
  animation: state.animation || null,
  scene: pick(state, ['meshes', 'materials', 'lights', 'effects', 'projectiles']),
});
const frameState = state => ({
  phase: state.phase,
  player: [state.player.x, state.player.z, state.player.yaw, state.player.action?.type || null, state.player.action?.elapsed || 0, state.player.health, state.player.stamina],
  guardian: [state.guardian.x, state.guardian.z, state.guardian.health, state.guardian.action?.type || null, state.guardian.action?.elapsed || 0],
});
fs.mkdirSync(output, { recursive: true });
if (video) fs.mkdirSync(frameDirectory, { recursive: true });
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(error ? 'Not found' : data);
  });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const results = {
    label: process.env.CAPTURE_LABEL || 'baseline', revision: process.env.CAPTURE_REVISION || null,
    sourceRoot: root, viewport: { width: 960, height: 640 },
    renderer: 'Chromium --use-angle=swiftshader (software WebGL)',
    frameTupleKeys: { player: ['x', 'z', 'yaw', 'actionType', 'actionElapsed', 'health', 'stamina'], guardian: ['x', 'z', 'health', 'actionType', 'actionElapsed'] },
    simulation: 'Manual captures advance four fixed 1/60 s updates per screenshot, encoded at 15 fps. This offline simulation playback is not a live frame-rate recording. RAF samples use the unchanged real-time loop.',
    captures: [], movie: { fps: captureFps, frames: [], segments: [] }, samples: [],
  };
  const snapshot = page => page.evaluate(() => window.__ORCA_TEST__.snapshot());
  const step = (page, seconds) => page.evaluate(seconds => window.__ORCA_TEST__.step(seconds), seconds);
  async function ready(page) {
    await page.evaluate(async () => {
      const test = window.__ORCA_TEST__; test.render();
      await window.BABYLON.EngineStore.LastCreatedScene.whenReadyAsync();
      test.render();
    });
  }
  async function open(quality = 'high', reducedMotion = false, manual = true) {
    const page = await browser.newPage({ viewport: results.viewport });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(settings => localStorage.setItem('orca-legends-settings', JSON.stringify(settings)), { quality, reducedMotion, volume: 0 });
    await page.goto(`http://127.0.0.1:${server.address().port}/orca-legends-game.html?test=1`);
    await page.waitForFunction(() => window.__ORCA_TEST__, null, { timeout: 90000 });
    if (manual) await page.evaluate(() => window.__ORCA_TEST__.manualClock());
    await page.locator('#start-button').click();
    if (manual) { await step(page, .85); await ready(page); }
    return page;
  }
  async function capture(page, name, meta = {}) {
    await ready(page);
    const state = await snapshot(page);
    await page.screenshot({ path: path.join(output, name + '.png') });
    results.captures.push({ name, ...meta, snapshot: captureState(state) });
    console.log(`CAPTURE ${name}: action=${state.player.action?.type || 'none'}, stamina=${state.player.stamina.toFixed(2)}, guardian=${state.guardian.health}, meshes=${state.meshes}, materials=${state.materials}`);
  }
  async function segment(page, name, count, input, stills, suffix, settings) {
    const startFrame = results.movie.frames.length;
    for (let index = 0; index < count; index++) {
      await input(index);
      await step(page, stepSeconds);
      if (stills[index]) await capture(page, stills[index] + suffix, { ...settings, segment: name, segmentSeconds: (index + 1) * stepSeconds });
      if (video && !suffix) {
        await ready(page);
        const frame = results.movie.frames.length;
        const filename = `frame-${String(frame).padStart(4, '0')}.png`;
        await page.screenshot({ path: path.join(frameDirectory, filename) });
        results.movie.frames.push({ frame, file: 'frames/' + filename, segment: name, segmentSeconds: (index + 1) * stepSeconds, snapshot: frameState(await snapshot(page)) });
      }
    }
    if (video && !suffix) results.movie.segments.push({ name, firstFrame: startFrame, frames: count, simulatedSeconds: count * stepSeconds });
  }

  for (const [quality, reducedMotion, suffix] of (enemiesOnly ? [] : [['high', false, ''], ['low', true, '-reduced']])) {
    const settings = { quality, reducedMotion };
    const page = await open(quality, reducedMotion);
    await capture(page, 'idle' + suffix, settings);
    // Actual camera drag followed by camera-relative walk, sprint, turn, brake.
    await page.mouse.move(460, 300); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(510, 300, { steps: 4 }); await page.mouse.up({ button: 'middle' });
    assert(Math.abs((await snapshot(page)).camera.yaw) > .05);
    await segment(page, 'walk-sprint-turn-brake-guard', 18, async index => {
      if (index === 0) await page.keyboard.down('KeyW');
      if (index === 5) await page.keyboard.down('ShiftLeft');
      if (index === 10) { await page.keyboard.up('KeyW'); await page.keyboard.down('KeyD'); }
      if (index === 13) { await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft'); }
      if (index === 16) await page.keyboard.down('KeyQ');
    }, { 4: 'walk', 9: 'sprint', 10: 'turn', 13: 'brake', 17: 'guard' }, suffix, settings);
    assert((await snapshot(page)).player.blocking, 'Real Q must hold guard');
    await page.keyboard.up('KeyQ');
    await step(page, 1 / 60);
    await segment(page, 'directional-dodge-and-landing', 12, async index => {
      if (index === 0) { await page.keyboard.down('KeyA'); await page.keyboard.press('Space'); assert.equal((await snapshot(page)).player.action.type, 'dodge'); }
      if (index === 3) await page.keyboard.up('KeyA');
    }, { 1: 'dodge', 5: 'landing', 11: 'dodge-recovered' }, suffix, settings);
    await segment(page, 'cast-and-recover', 6, async index => {
      if (index === 0) {
        const before = await snapshot(page); await page.keyboard.press('KeyF'); const after = await snapshot(page);
        assert.equal(after.player.mana, before.player.mana - 28); assert.equal(after.player.spellCooldown, 3.6); assert.equal(after.projectiles, 1);
      }
    }, { 0: 'cast', 5: 'cast-recovered' }, suffix, settings);
    await page.close();

    const enemy = await open(quality, reducedMotion);
    await enemy.evaluate(() => window.__ORCA_TEST__.position(0, 5.8));
    let frames = 0;
    while (!(await snapshot(enemy)).guardian.action && frames++ < 120) await step(enemy, 1 / 60);
    assert((await snapshot(enemy)).guardian.action, 'Existing Warden AI must begin its own windup');
    await segment(enemy, 'warden-windup-contact-recovery', 18, async () => {},
      { 2: 'enemy-windup', 9: 'enemy-commit', 14: 'enemy-contact', 17: 'enemy-recovery' }, suffix, settings);
    assert((await snapshot(enemy)).player.health < 100, 'Actual AI strike must deal damage');
    await enemy.close();

    const melee = await open(quality, reducedMotion);
    await melee.evaluate(() => window.__ORCA_TEST__.position(0, 5.8));
    await pageMouseAttack(melee);
    await step(melee, .10); await capture(melee, 'light-anticipation' + suffix, settings);
    await step(melee, .15); await capture(melee, 'light-contact' + suffix, settings);
    await step(melee, .4);
    await melee.keyboard.press('KeyR'); await step(melee, .52);
    await capture(melee, 'heavy-reaction' + suffix, settings);
    assert((await snapshot(melee)).guardian.health < 145, 'Real melee input must damage the Warden');
    await melee.close();
  }
  async function pageMouseAttack(page) { await page.mouse.click(480, 300); }

  // Reach Varr through actual R attacks, chest interaction and arena entry.
  // This route uses no health, loot, AI, action or entitlement mutation hooks.
  for (const [quality, reducedMotion, suffix] of [['high', false, ''], ['low', true, '-reduced']]) {
    const page = await open(quality, reducedMotion);
    for (let attack = 0; attack < 12 && !(await snapshot(page)).guardian.dead; attack++) {
      const state = await snapshot(page);
      await page.evaluate(({ x, z }) => window.__ORCA_TEST__.position(x, z - 2.1), state.guardian);
      await page.keyboard.press('KeyR'); await step(page, 1.0);
    }
    assert((await snapshot(page)).guardian.dead, 'Real starter heavy strikes must defeat the Warden');
    for (const [x, z, chest] of [[-19, .8, 'management'], [19, .8, 'positioning'], [0, 13.7, 'earnings']]) {
      await page.evaluate(([x, z]) => window.__ORCA_TEST__.position(x, z), [x, z]);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(chest => window.__ORCA_TEST__.snapshot().chests.includes(chest), chest);
      await step(page, .8);
    }
    assert((await snapshot(page)).arenaUnlocked);
    await page.evaluate(() => window.__ORCA_TEST__.position(0, 29.5)); await step(page, .1); await step(page, 3.2);
    assert.equal((await snapshot(page)).phase, 'arena');
    await page.evaluate(() => window.__ORCA_TEST__.position(0, 40.7));
    await page.keyboard.down('KeyQ');
    let strikeCaptured = false, shockCaptured = false;
    for (let frame = 0; frame < 1000 && !shockCaptured; frame++) {
      const state = await snapshot(page), action = state.gladiator.action;
      if (action && action.elapsed >= action.windup * .7 && !action.dealt) {
        if (action.type === 'shockwave') {
          await capture(page, 'champion-shockwave' + suffix, { quality, reducedMotion, windupSeconds: action.windup, elapsedSeconds: action.elapsed });
          shockCaptured = true;
        } else if (!strikeCaptured) {
          await capture(page, 'champion-strike' + suffix, { quality, reducedMotion, windupSeconds: action.windup, elapsedSeconds: action.elapsed });
          strikeCaptured = true;
        }
      }
      await step(page, 1 / 60);
    }
    assert(strikeCaptured && shockCaptured, 'Existing Varr AI must show its strike and third-attack Ember Ring');
    assert((await snapshot(page)).player.health > 0);
    await page.keyboard.up('KeyQ'); await page.close();
  }

  for (const [quality, reducedMotion] of (stillsOnly ? [] : [['high', false], ['low', true]])) {
    const page = await open(quality, reducedMotion, false);
    await page.waitForTimeout(1000);
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
    const sample = await page.evaluate(() => new Promise(resolve => {
      const intervals = []; let last = performance.now(); const start = last;
      function frame(now) {
        intervals.push(now - last); last = now;
        if (now - start < 4000) return requestAnimationFrame(frame);
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({ elapsedMs: now - start, frames: intervals.length,
          meanFrameMs: intervals.reduce((a, b) => a + b, 0) / intervals.length,
          p50FrameMs: sorted[Math.floor(sorted.length * .5)], p95FrameMs: sorted[Math.floor(sorted.length * .95)],
          snapshot: window.__ORCA_TEST__.snapshot() });
      }
      requestAnimationFrame(frame);
    }));
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    results.samples.push({ quality, reducedMotion, input: 'W + Shift held for the real RAF sample', ...sample, snapshot: captureState(sample.snapshot) });
    console.log(`SAMPLE ${quality}/reducedMotion=${reducedMotion}: ${sample.frames} frames / ${sample.elapsedMs.toFixed(1)}ms, mean=${sample.meanFrameMs.toFixed(2)}ms`);
    await page.close();
  }
  if (video) {
    const encoded = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(captureFps), '-i', path.join(frameDirectory, 'frame-%04d.png'), '-frames:v', String(results.movie.frames.length), '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-pix_fmt', 'yuv420p', path.join(output, 'motion-fixed-step.webm')], { encoding: 'utf8' });
    results.movie.encoded = encoded.status === 0;
    results.movie.encodingError = encoded.status === 0 ? null : encoded.error?.message || encoded.stderr;
    results.movie.durationSeconds = results.movie.frames.length / captureFps;
    if (!results.movie.encoded) console.warn('ffmpeg unavailable/failed; original PNG frames retained:', results.movie.encodingError);
  }
  results.errors = errors;
  fs.writeFileSync(path.join(output, enemiesOnly ? 'measurements-enemies.json' : 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
  assert.deepEqual(errors, [], 'Capture must have no browser JavaScript/console errors');
  console.log(`Evidence saved to ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
