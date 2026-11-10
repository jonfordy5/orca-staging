// Deterministic combat rules, independent of rendering and research providers.
export const ATTACKS = Object.freeze({
  light: Object.freeze({ duration: .56, impact: .22, stamina: 14, reach: 2.8, multiplier: 1, stagger: .32 }),
  heavy: Object.freeze({ duration: .94, impact: .48, stamina: 28, reach: 3.1, multiplier: 1.65, stagger: .75 }),
});
export const DODGE = Object.freeze({ duration: .48, stamina: 24, invulnerableUntil: .38, speed: 9.5 });
export function canAct(actor, cost = 0) {
  return actor.health > 0 && !actor.action && actor.stamina >= cost;
}
export function inAttackArc(attacker, target, reach, halfAngle = 1.3) {
  const dx = target.x - attacker.x, dz = target.z - attacker.z;
  const distance = Math.hypot(dx, dz);
  if (distance > reach) return false;
  if (distance < .15) return true;
  return (Math.sin(attacker.yaw) * dx + Math.cos(attacker.yaw) * dz) / distance >= Math.cos(halfAngle);
}
export function resolveDefense({ damage, blocking, stamina, defense = .45, perfect = false, dodging = false }) {
  if (dodging) return { damage: 0, staminaCost: 0, outcome: 'evaded' };
  if (blocking && stamina >= 10) {
    if (perfect) return { damage: 0, staminaCost: 6, outcome: 'parried' };
    return { damage: Math.max(1, Math.round(damage * (1 - Math.min(.75, defense)))), staminaCost: 10, outcome: 'blocked' };
  }
  return { damage, staminaCost: 0, outcome: blocking ? 'guard-broken' : 'hit' };
}
