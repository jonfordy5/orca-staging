// Original synthesized sounds; no recordings, remote assets, or autoplay.
export class VaultAudio {
  constructor(volume = .4) { this.volume = volume; this.context = null; }
  start() {
    try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume().catch(() => {}); } catch {}
  }
  play(kind) {
    const c = this.context; if (!c || !this.volume || c.state !== 'running') return;
    const table = { step: [85, .045, 'triangle', .09], swing: [180, .12, 'sawtooth', .13], hit: [70, .18, 'triangle', .3], block: [620, .12, 'square', .1], spell: [420, .45, 'sine', .17], chest: [660, .8, 'sine', .22], win: [880, 1.2, 'sine', .2] };
    const [freq, duration, type, strength] = table[kind] || table.hit;
    const oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'chest' || kind === 'win' ? freq * 2 : freq * .4, c.currentTime + duration);
    gain.gain.setValueAtTime(.001, c.currentTime); gain.gain.exponentialRampToValueAtTime(Math.max(.001, strength * this.volume), c.currentTime + .008);
    gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    oscillator.connect(gain).connect(c.destination); oscillator.start(); oscillator.stop(c.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose() { this.context?.close().catch(() => {}); }
}
