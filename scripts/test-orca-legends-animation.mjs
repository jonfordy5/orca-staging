/* WO-03 procedural motion checks in Babylon's real NullEngine. These tests
 * sample the shipped rig, never a copied animation implementation or a saved
 * pose snapshot. Contact values are the authored WO-01 contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const B = require('../game/vendor/babylon.js');
globalThis.window = { BABYLON: B, addEventListener() {}, removeEventListener() {} };
const { createFighter } = await import('../game/actors.js');
const dt = 1 / 60;
const near = (actual, expected, label, epsilon = 1e-6) => assert(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`);

function fixture(t, kind = 'hero') {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const actor = createFighter(scene, { kind });
  let time = 0;
  const update = (state = {}, seconds = dt) => {
    time += seconds;
    actor.update(seconds, { time, speed: 0, localVelocityX: 0, localVelocityZ: 0, turnRate: 0, ...state });
  };
  const frames = (count, state = {}) => { for (let i = 0; i < count; i++) update(state); };
  const node = label => scene.getTransformNodeByName(`${kind}-${label}`);
  t.after(() => { actor.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, actor, update, frames, node };
}

function pose(node) {
  return [...node.position.asArray(), ...node.rotation.asArray()];
}

test('distance advances footwork; held movement at a wall and idle do not run in place', t => {
  const f = fixture(t);
  f.frames(90, { moving: true, speed: 3.5, localVelocityZ: 3.5 });
  const moving = f.actor.motionSnapshot();
  f.frames(90, { moving: true, sprinting: true, speed: 0 }); // Sprint input still held against collision.
  const stopped = f.actor.motionSnapshot();
  near(stopped.phase, moving.phase, 'Blocked feet must stop advancing');
  assert(stopped.moveBlend < .01, 'Gait must settle when actual displacement is zero.');
  f.frames(60);
  near(f.actor.motionSnapshot().phase, stopped.phase, 'Idle cannot advance a walk cycle');
});

test('equal travel has equal walking cadence despite actual speed and frame rate', t => {
  const slow = fixture(t), fast = fixture(t), coarse = fixture(t);
  slow.frames(120, { moving: true, speed: 1.75, localVelocityZ: 1.75 });
  fast.frames(60, { moving: true, sprinting: true, speed: 3.5, localVelocityZ: 3.5 });
  for (let i = 0; i < 30; i++) coarse.update({ moving: true, speed: 3.5, localVelocityZ: 3.5 }, 1 / 30);
  near(slow.actor.motionSnapshot().phase, fast.actor.motionSnapshot().phase, 'Same distance at slower actual speed');
  near(coarse.actor.motionSnapshot().phase, fast.actor.motionSnapshot().phase, 'Same distance at 30/60 Hz');
  near(fast.actor.motionSnapshot().sprintBlend, 0, 'Held sprint cannot animate a run at ordinary actual speed');
});

test('walk, sprint, stop and turning blend continuously without moving the collision root', t => {
  const f = fixture(t);
  f.actor.root.position.set(4, 0, -7);
  f.actor.root.rotation.y = .6;
  const nodes = ['rig', 'pelvis', 'torso', 'hip--1', 'hip-1', 'knee--1', 'knee-1', 'shoulder--1', 'shoulder-1'].map(f.node);
  let previous = nodes.map(pose);
  const stages = [
    { moving: true, speed: 3.5, localVelocityZ: 3.5 },
    { moving: true, sprinting: true, speed: 6, localVelocityZ: 6 },
    { moving: true, speed: 3.5, localVelocityX: 3.5, turnRate: 9 },
    { moving: true, speed: 3.5, localVelocityX: -3.5, turnRate: -9 },
    {},
  ];
  for (const stage of stages) for (let frame = 0; frame < 60; frame++) {
    f.update(stage);
    const current = nodes.map(pose);
    for (let n = 0; n < current.length; n++) for (let axis = 0; axis < current[n].length; axis++) {
      assert(Number.isFinite(current[n][axis]));
      assert(Math.abs(current[n][axis] - previous[n][axis]) < .31, `Ordinary locomotion cannot snap ${nodes[n].name} axis ${axis} in a single 60 Hz frame.`);
    }
    assert.deepEqual(f.actor.root.position.asArray(), [4, 0, -7]);
    near(f.actor.root.rotation.y, .6, 'Motion must not rotate authoritative facing');
    assert(Math.abs(f.node('rig').position.y) <= .10, 'Locomotion bob stays modest.');
    assert(Math.abs(f.node('rig').rotation.x) <= .3, 'Forward lean stays bounded.');
    assert(Math.abs(f.node('rig').rotation.z) <= .25, 'Turn lean stays bounded.');
    previous = current;
  }
  assert(f.actor.motionSnapshot().moveBlend < .01);
});

test('reduced motion attenuates bob and turn lean while retaining readable legs', t => {
  const full = fixture(t), reduced = fixture(t);
  let fullBob = 0, reducedBob = 0, fullLean = 0, reducedLean = 0, reducedLeg = 0;
  for (let i = 0; i < 120; i++) {
    const state = { moving: true, sprinting: true, speed: 6, localVelocityX: 2, localVelocityZ: Math.sqrt(32), turnRate: 5 };
    full.update(state);
    reduced.update({ ...state, reducedMotion: true });
    fullBob = Math.max(fullBob, Math.abs(full.node('rig').position.y));
    reducedBob = Math.max(reducedBob, Math.abs(reduced.node('rig').position.y));
    fullLean = Math.max(fullLean, Math.abs(full.node('rig').rotation.z));
    reducedLean = Math.max(reducedLean, Math.abs(reduced.node('rig').rotation.z));
    reducedLeg = Math.max(reducedLeg, Math.abs(reduced.node('hip-1').rotation.x));
  }
  assert(fullBob > .01 && reducedBob < fullBob * .6);
  assert(fullLean > .01 && reducedLean < fullLean * .6);
  assert(reducedLeg > .1, 'Reduced motion retains the movement silhouette.');
  near(full.actor.motionSnapshot().phase, reduced.actor.motionSnapshot().phase, 'Motion preference cannot change traveled cadence');
});

test('dodge crouch has zero endpoints and a bounded middle; reset clears transient motion', t => {
  const f = fixture(t);
  f.update({ dodging: true, dodgeProgress: 0 }, 0);
  near(f.actor.motionSnapshot().dodgeEnvelope, 0, 'Dodge entry envelope');
  near(f.node('rig').position.y, 0, 'Dodge starts without a height snap');
  near(f.node('rig').rotation.x, 0, 'Dodge starts without a rotation snap');
  let deepest = 0;
  for (let i = 1; i <= 60; i++) {
    f.update({ dodging: true, dodgeProgress: i / 60 }, .48 / 60);
    deepest = Math.min(deepest, f.node('rig').position.y);
    assert(f.node('rig').position.y >= -.4);
  }
  assert(deepest < -.2, 'The middle of a dodge must still read as an evasive crouch.');
  near(f.actor.motionSnapshot().dodgeEnvelope, 0, 'Dodge exit envelope');
  assert(Math.abs(f.node('rig').position.y) <= .009, 'Dodge ends without residual crouch beyond the idle breathing amplitude.');
  near(f.node('rig').rotation.x, 0, 'Dodge ends without a rotation snap');
  f.frames(30, { moving: true, sprinting: true, speed: 6, localVelocityX: 6, turnRate: 8 });
  f.actor.resetMotion();
  f.update({}, 0);
  const reset = f.actor.motionSnapshot();
  near(reset.phase, 0, 'Restart clears old cadence');
  near(reset.moveBlend, 0, 'Restart clears locomotion blend');
  near(f.node('rig').rotation.z, 0, 'Restart clears turn lean');
});

test('planted feet stay level near the ground throughout an ordinary walk', t => {
  const f = fixture(t);
  f.frames(60, { moving: true, speed: 3.5, localVelocityZ: 3.5 });
  let samples = 0;
  for (let i = 0; i < 120; i++) {
    f.update({ moving: true, speed: 3.5, localVelocityZ: 3.5 });
    const phase = f.actor.motionSnapshot().phase;
    for (const side of [-1, 1]) {
      const cycle = ((phase + (side === -1 ? Math.PI : 0)) / (Math.PI * 2)) % 1;
      if (cycle >= .5) continue; // This foot is in the airborne half of its cycle.
      const ankle = f.node(`ankle-${side}`);
      ankle.computeWorldMatrix(true);
      const up = B.Vector3.TransformNormal(B.Axis.Y, ankle.getWorldMatrix()).normalize();
      assert(up.y > .99, 'The supporting boot must remain level rather than point into the floor.');
      assert(ankle.absolutePosition.y >= .04 && ankle.absolutePosition.y <= .12, 'The supporting boot center stays near the original .065-unit sole height.');
      samples++;
    }
  }
  assert(samples >= 120);
});

test('light and heavy still reach the authored WO-01 contact at their real impact ratios', t => {
  const f = fixture(t);
  const cases = [
    { type: 'light', impact: .22 / .56, shoulder: [-1.02, .32, .30], elbow: -.18, weapon: [2.36, .02], torso: [.055, .21], pelvis: .07, advance: .055 },
    { type: 'heavy', impact: .48 / .94, shoulder: [-1.05, .15, .04], elbow: -.14, weapon: [2.12, -.12], torso: [.16, .14], pelvis: .06, advance: .085 },
  ];
  for (const c of cases) for (const reducedMotion of [false, true]) {
    f.actor.resetMotion();
    f.update({ attacking: true, attackType: c.type, heavy: c.type === 'heavy', attackProgress: c.impact, attackImpact: c.impact, reducedMotion }, 0);
    const shoulder = f.node('shoulder--1');
    for (let axis = 0; axis < 3; axis++) near(shoulder.rotation.asArray()[axis], c.shoulder[axis], `${c.type} shoulder ${axis}`);
    near(f.node('elbow--1').rotation.x, c.elbow, `${c.type} elbow`);
    near(f.actor.weapon.rotation.x, c.weapon[0], `${c.type} blade pitch`);
    near(f.actor.weapon.rotation.z, c.weapon[1], `${c.type} blade roll`);
    near(f.node('torso').rotation.x, c.torso[0], `${c.type} torso pitch`);
    near(f.node('torso').rotation.y, c.torso[1], `${c.type} torso twist`);
    near(f.node('pelvis').rotation.y, c.pelvis, `${c.type} pelvis twist`);
    near(f.node('rig').position.z, c.advance, `${c.type} visual advance`);
  }
});

test('Cinderbolt releases immediately and yields to melee, guard, dodge, defeat and victory', t => {
  const f = fixture(t);
  f.update({ castAge: 0 }, 0);
  near(f.node('shoulder-1').rotation.x, -1.48, 'Immediate Cinderbolt palm release');
  near(f.node('elbow-1').rotation.x, -.02, 'Immediate Cinderbolt elbow release');
  near(f.actor.shield.rotation.x, -.32, 'Immediate Cinderbolt shield opening');
  for (const priority of [
    { attacking: true, attackType: 'light', attackProgress: .3 },
    { blocking: true }, { dodging: true, dodgeProgress: .5 }, { dead: true }, { victory: true },
  ]) {
    const withoutCast = fixture(t);
    const withCast = fixture(t);
    withoutCast.update(priority, .1);
    withCast.update({ ...priority, castAge: 0, spellReady: 1 }, .1);
    for (const name of ['rig', 'torso', 'shoulder-1', 'elbow-1']) assert.deepEqual(pose(withCast.node(name)), pose(withoutCast.node(name)), `Cinderbolt yields to ${Object.keys(priority)[0]}`);
    assert.deepEqual(pose(withCast.actor.shield), pose(withoutCast.actor.shield));
  }
});

test('enemy anticipation holds readably, releases at its supplied impact and recovers without root drift', t => {
  const contracts = [
    { kind: 'guardian', type: 'strike', impact: .9 / 1.55 },
    { kind: 'gladiator', type: 'strike', impact: .72 / 1.37 },
    { kind: 'gladiator', type: 'shockwave', impact: 1.1 / 1.75 },
  ];
  const contacts = [], anticipations = [];
  for (const c of contracts) {
    const f = fixture(t, c.kind);
    f.actor.root.position.set(3, 0, 8);
    f.actor.root.rotation.y = Math.PI;
    const windEnd = c.impact - (c.type === 'shockwave' ? .11 : .14);
    const attack = progress => f.update({ attacking: true, attackType: c.type, heavy: true, attackImpact: c.impact, attackProgress: progress }, 0);
    attack(windEnd * .8);
    const anticipation = [...pose(f.node('shoulder--1')), ...pose(f.actor.weapon)];
    anticipations.push(anticipation);
    attack(windEnd * .95);
    assert.deepEqual([...pose(f.node('shoulder--1')), ...pose(f.actor.weapon)], anticipation, `${c.kind} ${c.type} has a held readable anticipation`);
    attack(c.impact);
    const contact = [...pose(f.node('shoulder--1')), ...pose(f.actor.weapon)];
    assert(Math.abs(contact[3] - anticipation[3]) > .5, 'The release reaches a distinct contact shoulder angle.');
    contacts.push(contact);
    assert.deepEqual(f.actor.root.position.asArray(), [3, 0, 8]);
    near(f.actor.root.rotation.y, Math.PI, 'Telegraph cannot change gameplay facing');
    attack(1);
    near(f.actor.weapon.rotation.x, 2.64, 'Enemy blade recovers at the supplied action endpoint');
    near(f.actor.weapon.rotation.z, -.10, 'Enemy blade roll recovers');
  }
  assert.notDeepEqual(anticipations[0], anticipations[1], 'The two opponents have distinct anticipation silhouettes.');
  assert.deepEqual(contacts[0], contacts[1], 'Ordinary enemy strikes retain their common WO-01 contact.');
  assert.notDeepEqual(contacts[1], contacts[2], 'Champion shockwave is distinct from its normal strike.');
});

test('sustained movement, combat, settings changes and resets reuse the existing rig resources', t => {
  const f = fixture(t, 'guardian');
  const initial = [f.scene.meshes.length, f.scene.materials.length, f.scene.transformNodes.length, f.scene.animations.length];
  for (let i = 0; i < 2400; i++) {
    const progress = (i % 120) / 119;
    f.update({ moving: true, sprinting: i % 200 < 100, speed: 2.05, localVelocityZ: 2.05, turnRate: Math.sin(i) * 8, attacking: i % 120 < 90, attackType: 'strike', heavy: true, attackImpact: .9 / 1.55, attackProgress: progress, reducedMotion: i % 100 < 50 });
    if (i % 120 === 0) f.actor.resetMotion();
  }
  assert.deepEqual([f.scene.meshes.length, f.scene.materials.length, f.scene.transformNodes.length, f.scene.animations.length], initial);
  f.actor.dispose();
  assert.equal(f.scene.meshes.length, 0);
  assert.equal(f.scene.transformNodes.length, 0);
  assert.equal(f.scene.materials.length, 0);
});
