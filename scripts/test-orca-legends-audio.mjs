import test from 'node:test';
import assert from 'node:assert/strict';
import { VaultAudio } from '../game/audio.js';

// Track scheduled sources and connections so resource limits can be exercised
// without making Node depend on a speaker, browser, or Web Audio polyfill.
class Parameter {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class AudioNode {
  constructor(context, source = false) {
    this.context = context; this.gain = new Parameter(); this.frequency = new Parameter(); this.Q = new Parameter();
    this.connected = false; this.stopped = false; this.onended = null;
    context.nodes.push(this); if (source) context.sources.push(this);
  }
  connect(target) { this.connected = true; return target; }
  disconnect() { this.connected = false; }
  start() { this.started = true; }
  stop(when) { if (when === undefined) this.stopped = true; }
  finish() { this.stopped = true; this.onended?.(); }
}
class AudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.nodes = []; this.sources = []; this.buffers = []; this.destination = {}; this.closeCount = 0; }
  createGain() { return new AudioNode(this); }
  createOscillator() { return new AudioNode(this, true); }
  createBufferSource() { return new AudioNode(this, true); }
  createBiquadFilter() { return new AudioNode(this); }
  createBuffer(channels, length) { const samples = new Float32Array(length); const buffer = { getChannelData: () => samples }; this.buffers.push(buffer); return buffer; }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; this.closeCount++; return Promise.resolve(); }
}
globalThis.window = { AudioContext };

test('audio remains opt-in; live mute silences ringing cues and prevents new allocations', () => {
  const audio = new VaultAudio(.35);
  audio.play('parry'); assert.equal(audio.context, null);
  audio.start(); audio.play('parry');
  assert.equal(audio.voices.size, 1);
  const count = audio.context.nodes.length;
  audio.volume = 0;
  assert.equal(audio.master.gain.value, 0);
  audio.play('heavy-hit'); assert.equal(audio.context.nodes.length, count);
  audio.volume = .5; assert.equal(audio.master.gain.value, .5);
  audio.context.state = 'suspended'; audio.play('hit'); assert.equal(audio.context.nodes.length, count);
  audio.dispose();
});

test('combat bursts cap concurrent voices and reuse one noise buffer; ended cues disconnect', () => {
  const audio = new VaultAudio(); audio.start();
  for (let i = 0; i < 40; i++) audio.play(i % 2 ? 'heavy-hit' : 'parry');
  assert.equal(audio.voices.size, 12);
  assert.equal(audio.context.buffers.length, 1);
  assert.equal(audio.context.sources.filter(source => !source.stopped).length, 36);
  assert.ok(audio.context.sources.filter(source => source.stopped).every(source => !source.connected));
  for (const source of audio.context.sources) source.finish();
  assert.equal(audio.voices.size, 0);
  assert.ok(audio.context.nodes.filter(node => node !== audio.master).every(node => !node.connected));
  audio.dispose();
});

test('all supported cues release sources on disposal and disposed audio cannot restart', () => {
  const audio = new VaultAudio(); audio.start();
  for (const cue of ['step', 'swing', 'heavy-swing', 'hit', 'heavy-hit', 'block', 'parry', 'guard-break', 'spell', 'chest', 'win']) audio.play(cue);
  const context = audio.context;
  assert.equal(audio.voices.size, 11);
  audio.dispose(); audio.dispose(); audio.start(); audio.play('hit');
  assert.equal(audio.context, context); assert.equal(context.closeCount, 1);
  assert.equal(audio.voices.size, 0); assert.equal(audio.noise, null);
  assert.ok(context.sources.every(source => source.stopped));
  assert.ok(context.nodes.every(node => !node.connected));
});

test('each Cinderbolt cue completes all layers and releases every node while sharing the noise buffer', () => {
  const audio = new VaultAudio(.35); audio.start();
  for (const cue of ['spell-charge', 'spell-launch', 'spell-impact', 'spell-fizzle']) {
    audio.play(cue);
    const voice = [...audio.voices][0];
    assert.equal(audio.voices.size, 1, `${cue} creates one bounded voice`);
    assert.ok(voice.sources.length > 1, `${cue} has its own layered synthesis`);
    for (const source of voice.sources.slice(0, -1)) source.finish();
    assert.equal(audio.voices.size, 1, `${cue} retains the remaining layer`);
    voice.sources.at(-1).finish();
    assert.equal(audio.voices.size, 0, `${cue} releases naturally`);
    assert.ok(voice.sources.every(source => source.stopped && source.onended === null));
    assert.ok(voice.nodes.every(node => !node.connected));
  }
  assert.equal(audio.context.buffers.length, 1);
  audio.dispose();
});

test('overlapping spell and sword cues share the twelve-voice budget, live mute and final disposal', () => {
  const audio = new VaultAudio(.35); audio.start();
  const cues = ['spell-charge', 'spell-launch', 'spell-impact', 'spell-fizzle', 'heavy-hit', 'parry'];
  for (let i = 0; i < 72; i++) audio.play(cues[i % cues.length]);
  assert.equal(audio.voices.size, 12);
  assert.equal(audio.context.buffers.length, 1);
  assert.ok(audio.context.sources.some(source => source.stopped));
  assert.ok(audio.context.sources.filter(source => source.stopped).every(source => !source.connected));
  const nodeCount = audio.context.nodes.length;
  audio.volume = 0;
  for (const cue of cues) audio.play(cue);
  assert.equal(audio.master.gain.value, 0);
  assert.equal(audio.context.nodes.length, nodeCount);
  audio.dispose();
  assert.equal(audio.voices.size, 0);
  assert.ok(audio.context.nodes.every(node => !node.connected));
  assert.ok(audio.context.sources.every(source => source.stopped));
});

test('a failed spell audio device disconnects partially created layers without interrupting later cues', () => {
  const audio = new VaultAudio(); audio.start();
  const context = audio.context;
  const createOscillator = context.createOscillator.bind(context);
  context.createOscillator = () => { throw new Error('optional device unavailable'); };
  assert.doesNotThrow(() => audio.play('spell-fizzle'));
  assert.equal(audio.voices.size, 0);
  assert.ok(context.nodes.filter(node => node !== audio.master).every(node => !node.connected));
  context.createOscillator = createOscillator;
  audio.play('spell-launch'); assert.equal(audio.voices.size, 1);
  audio.dispose();
});
