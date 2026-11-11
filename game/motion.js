/* Bounded, allocation-free presentation state. No root transform or gameplay
 * velocity is written here; the caller supplies measured, post-collision motion. */
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => Number.isFinite(value) ? value : 0;
const ease = value => { value = clamp(value, 0, 1); return value * value * (3 - 2 * value); };

export function createMotionState() {
  return { phase: 0, distance: 0, speed: 0, blend: 0, sprint: 0,
    directionX: 0, directionZ: 1, turn: 0, forwardLean: 0, sideLean: 0,
    dodge: 0, bob: 0 };
}

export function resetMotion(state) {
  state.phase = state.distance = state.speed = state.blend = state.sprint = 0;
  state.directionX = state.turn = state.forwardLean = state.sideLean = 0;
  state.directionZ = 1;
  state.dodge = state.bob = 0;
}

export function advanceMotion(motion, dt, state, scale = 1) {
  dt = clamp(finite(dt), 0, .1);
  const active = !state.dead && !state.victory;
  const measured = Number.isFinite(state.speed) ? state.speed : state.moving ? (state.sprinting ? 6 : 3.5) : 0;
  const speed = active ? clamp(measured, 0, 18) : 0;
  const walking = speed >= .02 && !state.dodging;
  const response = 1 - Math.exp(-(walking ? 16 : 14) * dt);
  motion.speed = walking ? speed : 0;
  motion.blend += ((walking ? Math.min(1, speed / (2.8 * scale)) : 0) - motion.blend) * response;
  const running = walking ? ease((speed / scale - 3.5) / 2.5) : 0;
  motion.sprint += (running - motion.sprint) * (1 - Math.exp(-10 * dt));
  if (walking) {
    // A complete left/right cycle follows distance, including partial wall
    // slides. Gait stops immediately when collision stops actual translation.
    const distance = speed * dt;
    motion.phase = (motion.phase + distance * TAU / ((2.4 + .3 * motion.sprint) * scale)) % TAU;
    motion.distance = (motion.distance + distance) % 4096;
    const x = Number.isFinite(state.localVelocityX) ? state.localVelocityX / speed : 0;
    const z = Number.isFinite(state.localVelocityZ) ? state.localVelocityZ / speed : 1;
    const length = Math.hypot(x, z) || 1;
    motion.directionX += (x / length - motion.directionX) * response;
    motion.directionZ += (z / length - motion.directionZ) * response;
  }
  const turn = active && !state.dodging ? clamp(finite(state.turnRate), -8, 8) : 0;
  motion.turn += (turn - motion.turn) * (1 - Math.exp(-13 * dt));
  const leanResponse = 1 - Math.exp(-11 * dt);
  motion.forwardLean += ((walking ? -.07 * motion.blend - .07 * motion.sprint : 0) - motion.forwardLean) * leanResponse;
  motion.sideLean += ((walking ? clamp(-motion.turn * .016 - motion.directionX * .07, -.14, .14) * motion.blend : 0) - motion.sideLean) * leanResponse;
  // Entry and exit are tied to authoritative dodge progress; they never add
  // an animation delay or extend invulnerability beyond the original action.
  const progress = clamp(finite(state.dodgeProgress), 0, 1);
  motion.dodge = state.dodging && active ? ease(progress / .36) * ease((1 - progress) / .24) : 0;
  motion.bob = Math.sin(motion.phase * 2) * .013 * motion.blend * (1 + .5 * motion.sprint);
  return motion;
}
