// Original, presentation-only melee feedback. Pools are allocated once per scene;
// no hit-stop, random gameplay inputs, lights, textures or per-hit mesh creation.
import { ATTACKS } from './combat.js';
const B = window.BABYLON;
const COLORS = { hit: '#ffe0a0', heavy: '#ffd079', block: '#c4dded', parry: '#9bf4df', 'guard-break': '#ffad78' };
const SPARKS = 16, FLASHES = 3, TRAIL_POINTS = 6;

export class CombatFeedback {
  constructor(scene) {
    this.scene = scene; this.cursor = 0; this.flashCursor = 0; this.lastEvent = null;
    this.pulse = 0; this.pulseDuration = 0; this.pulseStrength = 0; this.disposed = false;
    this.materials = Object.fromEntries(Object.entries(COLORS).map(([kind, color]) => {
      const mat = new B.StandardMaterial(`combat-${kind}`, scene);
      mat.emissiveColor = B.Color3.FromHexString(color); mat.disableLighting = true;
      mat.backFaceCulling = false; mat.alphaMode = B.Engine.ALPHA_ADD;
      return [kind, mat];
    }));
    this.sparks = Array.from({ length: SPARKS }, (_, i) => {
      const mesh = B.MeshBuilder.CreateBox(`combat-spark-${i}`, { width: .025, height: .13, depth: .025 }, scene);
      mesh.isPickable = false; mesh.setEnabled(false);
      return { mesh, life: 0, duration: 0, vx: 0, vy: 0, vz: 0 };
    });
    this.flashes = Array.from({ length: FLASHES }, (_, i) => {
      // Eight-point, tapered metal glint, rather than an opaque screen flash.
      const mesh = new B.Mesh(`combat-contact-${i}`, scene), positions = [0, 0, 0], indices = [];
      for (let n = 0; n < 16; n++) {
        const a = n * Math.PI / 8, radius = n % 2 ? .09 : n % 4 ? .28 : .48;
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        indices.push(0, n + 1, (n + 1) % 16 + 1);
      }
      const data = new B.VertexData(); data.positions = positions; data.indices = indices;
      data.normals = new Array(positions.length).fill(0); data.applyToMesh(mesh);
      mesh.isPickable = false; mesh.billboardMode = B.Mesh.BILLBOARDMODE_ALL; mesh.setEnabled(false);
      return { mesh, life: 0, duration: 0, size: 1 };
    });
    this.trail = new B.Mesh('combat-blade-ribbon', scene); this.trail.isPickable = false;
    this.trail.material = this.materials.hit; this.trail.hasVertexAlpha = true; this.trail.setEnabled(false);
    this.points = Array.from({ length: TRAIL_POINTS }, () => ({ base: new B.Vector3(), tip: new B.Vector3() }));
    this.baseLocal = new B.Vector3(0, .25, 0); this.tipLocal = new B.Vector3(0, .98, 0);
    this.positions = new Float32Array(TRAIL_POINTS * 6);
    const colors = [], indices = [];
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const alpha = .23 * (1 - i / (TRAIL_POINTS - 1));
      colors.push(1, 1, 1, alpha * .25, 1, 1, 1, alpha);
      if (i < TRAIL_POINTS - 1) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    const data = new B.VertexData(); data.positions = this.positions; data.indices = indices;
    data.colors = colors; data.normals = new Float32Array(this.positions.length); data.applyToMesh(this.trail, true);
    this.trailActive = false;
  }
  contact(kind, x, y, z, dx, dz, settings) {
    if (this.disposed) return;
    this.lastEvent = kind;
    const material = this.materials[kind] || this.materials.hit;
    const strong = kind === 'heavy' || kind === 'parry' || kind === 'guard-break';
    const count = settings.reducedMotion ? 2 : settings.quality === 'low' ? (strong ? 5 : 3) : (strong ? 12 : 7);
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.cursor++ % SPARKS], angle = i * 2.399;
      spark.duration = spark.life = settings.reducedMotion ? .14 : strong ? .28 : .20;
      spark.mesh.material = material; spark.mesh.position.set(x, y, z);
      spark.mesh.rotation.set(Math.sin(angle), angle, Math.cos(angle));
      spark.mesh.visibility = 1; spark.mesh.setEnabled(true);
      const speed = settings.reducedMotion ? .25 : strong ? 2.1 : 1.4;
      spark.vx = (Math.cos(angle) + dx * .6) * speed;
      spark.vy = (.3 + (i % 3) * .35) * speed;
      spark.vz = (Math.sin(angle) + dz * .6) * speed;
    }
    const flash = this.flashes[this.flashCursor++ % FLASHES];
    flash.duration = flash.life = settings.reducedMotion ? .11 : strong ? .18 : .12;
    flash.size = settings.reducedMotion ? .45 : strong ? 1.15 : .7;
    flash.mesh.position.set(x, y, z); flash.mesh.material = material;
    flash.mesh.scaling.setAll(flash.size); flash.mesh.visibility = .9; flash.mesh.setEnabled(true);
    if (!settings.reducedMotion && (kind === 'heavy' || kind === 'parry')) {
      // A single damped camera nod, at most 0.06 world units, never cumulative.
      this.pulse = this.pulseDuration = kind === 'parry' ? .16 : .20;
      this.pulseStrength = kind === 'parry' ? .045 : .06;
    }
  }
  miss() { this.lastEvent = 'miss'; }
  update(dt, settings) {
    if (this.disposed) return;
    if (settings.reducedMotion) this.pulse = 0;
    else this.pulse = Math.max(0, this.pulse - dt);
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life = Math.max(0, spark.life - dt);
      spark.mesh.position.x += spark.vx * dt; spark.mesh.position.y += spark.vy * dt; spark.mesh.position.z += spark.vz * dt;
      if (!settings.reducedMotion) spark.vy -= dt * 4;
      spark.mesh.visibility = spark.life / spark.duration;
      if (!spark.life) spark.mesh.setEnabled(false);
    }
    for (const flash of this.flashes) {
      if (flash.life <= 0) continue;
      flash.life = Math.max(0, flash.life - dt); flash.mesh.visibility = flash.life / flash.duration * .9;
      if (!settings.reducedMotion) flash.mesh.scaling.setAll(flash.size * (.85 + .3 * flash.life / flash.duration));
      if (!flash.life) flash.mesh.setEnabled(false);
    }
  }
  updateTrail(weapon, action, settings) {
    if (this.disposed) return;
    const spec = ATTACKS[action?.type];
    const active = !settings.reducedMotion && spec && action.elapsed >= spec.impact - (action.type === 'heavy' ? .15 : .09) && action.elapsed < spec.impact + .10;
    if (!active) { this.trailActive = false; this.trail.setEnabled(false); return; }
    const length = settings.quality === 'low' ? 3 : TRAIL_POINTS;
    for (let i = TRAIL_POINTS - 1; i > 0; i--) {
      this.points[i].base.copyFrom(this.points[i - 1].base); this.points[i].tip.copyFrom(this.points[i - 1].tip);
    }
    const matrix = weapon.computeWorldMatrix(true), first = this.points[0];
    B.Vector3.TransformCoordinatesToRef(this.baseLocal, matrix, first.base);
    B.Vector3.TransformCoordinatesToRef(this.tipLocal, matrix, first.tip);
    if (!this.trailActive) for (let i = 1; i < TRAIL_POINTS; i++) {
      this.points[i].base.copyFrom(first.base); this.points[i].tip.copyFrom(first.tip);
    }
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const point = this.points[Math.min(i, length - 1)], offset = i * 6;
      this.positions[offset] = point.base.x; this.positions[offset + 1] = point.base.y; this.positions[offset + 2] = point.base.z;
      this.positions[offset + 3] = point.tip.x; this.positions[offset + 4] = point.tip.y; this.positions[offset + 5] = point.tip.z;
    }
    this.trail.updateVerticesData(B.VertexBuffer.PositionKind, this.positions, true);
    this.trail.material = action.type === 'heavy' ? this.materials.heavy : this.materials.hit;
    this.trailActive = true; this.trail.setEnabled(true);
  }
  cameraOffset() {
    if (!this.pulse || !this.pulseDuration) return 0;
    const progress = 1 - this.pulse / this.pulseDuration;
    return Math.sin(progress * Math.PI) * (1 - progress) * this.pulseStrength;
  }
  snapshot() {
    return { activeSparks: this.sparks.filter(s => s.life > 0).length, activeFlashes: this.flashes.filter(f => f.life > 0).length,
      trailActive: this.trailActive, cameraImpulse: this.cameraOffset(), lastEvent: this.lastEvent,
      poolMeshes: SPARKS + FLASHES + 1, poolMaterials: Object.keys(this.materials).length };
  }
  clear() {
    for (const effect of [...this.sparks, ...this.flashes]) { effect.life = 0; effect.mesh.setEnabled(false); }
    this.trailActive = false; this.trail.setEnabled(false); this.pulse = 0; this.lastEvent = null;
  }
  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    for (const effect of [...this.sparks, ...this.flashes]) effect.mesh.dispose();
    this.trail.dispose(); for (const material of Object.values(this.materials)) material.dispose();
  }
}
