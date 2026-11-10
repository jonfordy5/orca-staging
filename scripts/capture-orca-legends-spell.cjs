/* Repeatable WO-02 browser evidence. Position/manual-time hooks only arrange
 * the scene; KeyF, projectile collision, damage, mana and cooldown are real. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const checkout = path.resolve(__dirname, '..');
const root = path.resolve(process.env.SPELL_CAPTURE_ROOT || checkout);
const output = path.resolve(process.env.CAPTURE_DIR || path.join(checkout, 'work/wo-02-capture'));
const stillsOnly = Boolean(process.env.CAPTURE_STILLS_ONLY);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };
fs.mkdirSync(output, { recursive: true });
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
    label: process.env.CAPTURE_LABEL || 'baseline',
    revision: process.env.CAPTURE_REVISION || null,
    sourceRoot: root,
    viewport: { width: 960, height: 640 },
    renderer: 'Chromium --use-angle=swiftshader (software WebGL)',
    simulation: 'Manual stills advance fixed 1/60 s frames; performance samples use the unchanged real-time render loop.',
    samples: [], captures: [],
  };
  async function open(quality = 'high', reducedMotion = false) {
    const page = await browser.newPage({ viewport: results.viewport });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(settings => localStorage.setItem('orca-legends-settings', JSON.stringify(settings)), { quality, reducedMotion, volume: 0 });
    await page.goto(`http://127.0.0.1:${server.address().port}/orca-legends-game.html?test=1`);
    await page.waitForFunction(() => window.__ORCA_TEST__, null, { timeout: 90000 });
    await page.locator('#start-button').click();
    return page;
  }
  async function capture(page, name, elapsedSeconds, extra = {}) {
    await page.evaluate(async () => {
      const test = window.__ORCA_TEST__;
      test.render();
      // Newly enabled pooled FX and dynamic legacy particles may compile a
      // material on their first render. Keep simulation frozen while readying
      // that real scene, then render its actual pixels for the still.
      await window.BABYLON.EngineStore.LastCreatedScene.whenReadyAsync();
      test.render();
    });
    const snapshot = await page.evaluate(() => window.__ORCA_TEST__.snapshot());
    await page.screenshot({ path: path.join(output, name + '.png') });
    results.captures.push({ name, elapsedSeconds, ...extra, snapshot });
    console.log(`CAPTURE ${name}: mana=${snapshot.player.mana.toFixed(2)}, guardian=${snapshot.guardian.health}, projectiles=${snapshot.projectiles}, meshes=${snapshot.meshes}, materials=${snapshot.materials}`);
  }
  async function prepare(quality, reducedMotion, z) {
    const page = await open(quality, reducedMotion);
    await page.evaluate(z => {
      const test = window.__ORCA_TEST__;
      test.manualClock(); test.step(.85); test.position(0, z); test.step(1 / 60);
    }, z);
    return page;
  }
  async function cast(page) {
    const before = await page.evaluate(() => window.__ORCA_TEST__.snapshot());
    await page.keyboard.press('KeyF');
    const after = await page.evaluate(() => window.__ORCA_TEST__.snapshot());
    assert.equal(after.player.mana, before.player.mana - 28, 'F must spend the existing 28 mana');
    assert.equal(after.player.spellCooldown, 3.6, 'F must start the existing cooldown');
    assert.equal(after.projectiles, 1, 'F must immediately create the real projectile');
    return before;
  }
  // Close view documents the idle readiness/charge cue before input, followed
  // by immediate release. The legacy spell has no readiness presentation.
  const close = await prepare('high', false, 5.8);
  await capture(close, 'ready', null, { quality: 'high', reducedMotion: false, playerZ: 5.8 });
  await close.evaluate(() => window.__ORCA_TEST__.step(21 / 60));
  await capture(close, 'charge', null, { quality: 'high', reducedMotion: false, playerZ: 5.8, readinessSeconds: 21 / 60 });
  const closeBefore = await cast(close);
  await close.evaluate(() => window.__ORCA_TEST__.step(1 / 60));
  await capture(close, 'launch', 1 / 60, { quality: 'high', reducedMotion: false, playerZ: 5.8 });
  const closeImpactFrames = await close.evaluate(health => {
    const test = window.__ORCA_TEST__; let frames = 1;
    while (test.snapshot().guardian.health === health && frames < 100) { test.step(1 / 60); frames++; }
    return frames;
  }, closeBefore.guardian.health);
  assert((await close.evaluate(() => window.__ORCA_TEST__.snapshot())).guardian.health < closeBefore.guardian.health);
  const closeHitSeconds = closeImpactFrames / 60;
  await close.evaluate(() => window.__ORCA_TEST__.step(3 / 60));
  await capture(close, 'impact-close', closeHitSeconds + 3 / 60,
    { quality: 'high', reducedMotion: false, playerZ: 5.8, collisionSeconds: closeHitSeconds });
  await close.evaluate(() => window.__ORCA_TEST__.step(18 / 60));
  await capture(close, 'afterglow-close', closeHitSeconds + 21 / 60,
    { quality: 'high', reducedMotion: false, playerZ: 5.8, collisionSeconds: closeHitSeconds });
  await close.close();

  // Longer flight keeps the projectile clear of the hero and lets the same
  // genuine collision determine the impact frame in both source revisions.
  for (const [quality, reducedMotion, suffix] of [['high', false, ''], ['low', true, '-reduced']]) {
    const page = await prepare(quality, reducedMotion, -3);
    const before = await cast(page);
    await page.evaluate(() => window.__ORCA_TEST__.step(10 / 60));
    const meta = { quality, reducedMotion, playerZ: -3 };
    await capture(page, 'flight' + suffix, 10 / 60, meta);
    const impact = await page.evaluate(health => {
      const test = window.__ORCA_TEST__;
      let frames = 0;
      while (test.snapshot().guardian.health === health && frames < 100) { test.step(1 / 60); frames++; }
      return { frames, snapshot: test.snapshot() };
    }, before.guardian.health);
    assert(impact.snapshot.guardian.health < before.guardian.health, 'The actual projectile must hit the Warden');
    await page.evaluate(() => window.__ORCA_TEST__.step(3 / 60));
    const hitSeconds = (10 + impact.frames) / 60;
    await capture(page, 'impact' + suffix, hitSeconds + 3 / 60, { ...meta, collisionSeconds: hitSeconds });
    await page.evaluate(() => window.__ORCA_TEST__.step(18 / 60));
    await capture(page, 'afterglow' + suffix, hitSeconds + 21 / 60, { ...meta, collisionSeconds: hitSeconds });
    await page.close();
  }

  // The paired settings match WO-01. The rows differ in both quality and
  // motion setting and cannot isolate either cost. One real F input is sampled.
  for (const [quality, reducedMotion] of (stillsOnly ? [] : [['high', false], ['low', true]])) {
    const page = await open(quality, reducedMotion);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__ORCA_TEST__.position(0, 5.8));
    const before = await page.evaluate(() => window.__ORCA_TEST__.snapshot());
    const sampling = page.evaluate(() => new Promise(resolve => {
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
    await page.keyboard.press('KeyF');
    const sample = await sampling;
    results.samples.push({ quality, reducedMotion, input: 'one real KeyF press', before, ...sample });
    console.log(`SAMPLE ${quality}/reducedMotion=${reducedMotion}: ${sample.frames} frames / ${sample.elapsedMs.toFixed(1)}ms, mean=${sample.meanFrameMs.toFixed(2)}ms`);
    await page.close();
  }
  results.errors = errors;
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
  assert.deepEqual(errors, [], 'Capture must have no browser JavaScript/console errors');
  console.log(`Evidence saved to ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
