// Original synthesis only: no recordings, remote assets, or autoplay.
// Each cue layers a short air/metal transient with a pitched body. One shared
// noise buffer and a fixed voice budget keep repeated combat sounds bounded.
const MAX_VOICES = 12;
const tone = (frequency, end, duration, strength, type = 'sine') => ({ frequency, end, duration, strength, type });
const air = (frequency, end, duration, strength) => ({ frequency, end, duration, strength, noise: true });
const CUES = {
  step: [tone(85, 34, .045, .09, 'triangle')],
  swing: [air(1400, 450, .13, .20), tone(180, 65, .11, .035, 'triangle')],
  'heavy-swing': [air(950, 180, .22, .29), tone(110, 38, .19, .07, 'triangle')],
  hit: [tone(135, 45, .14, .27, 'triangle'), air(2400, 650, .065, .16), tone(1050, 710, .11, .045)],
  'heavy-hit': [tone(90, 30, .26, .36, 'triangle'), air(1800, 330, .12, .23), tone(420, 145, .20, .10)],
  block: [tone(680, 620, .22, .15), tone(1120, 970, .16, .075), air(3500, 2200, .055, .12)],
  parry: [tone(1040, 1560, .34, .18), tone(1560, 2340, .23, .10), air(4000, 2300, .055, .13)],
  'guard-break': [tone(145, 38, .28, .28, 'triangle'), air(1200, 280, .14, .21), tone(410, 160, .24, .11)],
  spell: [tone(420, 168, .45, .17)],
  chest: [tone(660, 1320, .8, .22)],
  win: [tone(880, 1760, 1.2, .2)],
};

export class VaultAudio {
  constructor(volume = .4) {
    this.context = null; this.master = null; this.noise = null;
    this.voices = new Set(); this.disposed = false; this.volume = volume;
  }
  get volume() { return this._volume; }
  set volume(value) {
    this._volume = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
    if (this.master && this.context.state !== 'closed') {
      // A master gain makes muting silence sounds that are already ringing.
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(this._volume, this.context.currentTime);
    }
  }
  start() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.context.createGain(); this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      this.context.resume().catch(() => {});
    } catch {}
  }
  noiseBuffer() {
    if (this.noise) return this.noise;
    const c = this.context;
    this.noise = c.createBuffer(1, Math.ceil(c.sampleRate * .5), c.sampleRate);
    const samples = this.noise.getChannelData(0);
    // Local seeded synthesis does not consume or change gameplay randomness.
    let seed = 0x6f726361;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 0x80000000 - 1;
    }
    return this.noise;
  }
  release(voice) {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch {}
    }
    for (const node of voice.nodes) node.disconnect();
  }
  play(kind) {
    const c = this.context;
    if (this.disposed || !c || !this.volume || c.state !== 'running') return;
    if (this.voices.size >= MAX_VOICES) this.release(this.voices.values().next().value);
    const layers = CUES[kind] || CUES.hit;
    const voice = { sources: [], nodes: [], remaining: layers.length };
    this.voices.add(voice);
    try {
      for (const layer of layers) {
        const now = c.currentTime, end = now + layer.duration;
        const source = layer.noise ? c.createBufferSource() : c.createOscillator();
        const gain = c.createGain();
        voice.sources.push(source); voice.nodes.push(source, gain);
        if (layer.noise) {
          source.buffer = this.noiseBuffer();
          const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = .7;
          filter.frequency.setValueAtTime(layer.frequency, now);
          filter.frequency.exponentialRampToValueAtTime(layer.end, end);
          source.connect(filter).connect(gain); voice.nodes.push(filter);
        } else {
          source.type = layer.type;
          source.frequency.setValueAtTime(layer.frequency, now);
          source.frequency.exponentialRampToValueAtTime(layer.end, end);
          source.connect(gain);
        }
        gain.gain.setValueAtTime(.001, now);
        gain.gain.exponentialRampToValueAtTime(layer.strength, now + .006);
        gain.gain.exponentialRampToValueAtTime(.001, end);
        gain.connect(this.master);
        source.onended = () => { if (--voice.remaining === 0) this.release(voice); };
        source.start(now); source.stop(end);
      }
    } catch {
      // Audio is optional; a denied/broken device must not interrupt combat.
      this.release(voice);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of this.voices) this.release(voice);
    this.master?.disconnect(); this.noise = null;
    this.context?.close().catch(() => {});
  }
}
