// Reproducible real Web Audio check; does not use WebGL or contact a server.
// Run from repository root: node scripts/check-orca-legends-audio-browser.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const metrics = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { VaultAudio } = await import(url); URL.revokeObjectURL(url);
      const results = {};
      for (const kind of ['swing', 'heavy-swing', 'hit', 'heavy-hit', 'block', 'parry', 'guard-break', 'spell', 'spell-charge', 'spell-launch', 'spell-impact', 'spell-fizzle']) {
        const context = new OfflineAudioContext(1, 44100, 44100);
        const audio = new VaultAudio(.35);
        // Offline contexts begin suspended: schedule the normal synthesis path
        // before startRendering, retaining the real Web Audio node methods.
        audio.context = new Proxy(context, { get(target, name) {
          if (name === 'state') return 'running';
          const value = Reflect.get(target, name, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        audio.master = context.createGain(); audio.master.gain.value = .35; audio.master.connect(context.destination);
        audio.play(kind);
        const samples = (await context.startRendering()).getChannelData(0);
        let peak = 0, sum = 0;
        for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
        results[kind] = { peak, rms: Math.sqrt(sum / samples.length), remainingVoices: audio.voices.size };
      }
      return results;
    }, fs.readFileSync(path.join(__dirname, '..', 'game/audio.js'), 'utf8'));
    assert.deepEqual(errors, []);
    for (const result of Object.values(metrics)) {
      assert(Number.isFinite(result.rms)); assert(result.rms > .001);
      assert(result.peak < 1); assert.equal(result.remainingVoices, 0);
    }
    assert(metrics['heavy-hit'].rms > metrics.hit.rms);
    assert(metrics['spell-impact'].rms > metrics['spell-launch'].rms);
    assert(metrics['spell-launch'].rms > metrics['spell-charge'].rms);
    assert(metrics['spell-launch'].rms > metrics['spell-fizzle'].rms);
    assert.equal(new Set(['spell-charge', 'spell-launch', 'spell-impact', 'spell-fizzle'].map(kind => metrics[kind].rms)).size, 4);
    console.log(JSON.stringify(metrics, null, 2));
    console.log('PASS real Chromium combat and Cinderbolt synthesis: nonzero finite signals, no clipping at .35 volume, stronger heavy/spell impacts, four distinct spell cues, all voices released. Subjective listening not assessed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
