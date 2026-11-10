// Original Cinderbolt presentation. This pool never advances a projectile or
// changes its damage, target, lifetime, collision radius, mana or cooldown.
const B = window.BABYLON;
const FLIGHTS = 3, IMPACTS = 3, SPARKS = 16, TRAIL_POINTS = 9, LIGHT_TARGETS = 64;
const clamp01 = value => Math.max(0, Math.min(1, value));

export class SpellFeedback {
  constructor(scene) {
    this.scene = scene; this.disposed = false; this.time = 0; this.serial = 0;
    this.sparkCursor = 0; this.impactCursor = 0; this.chargeReadiness = 0;
    this.lastEvent = null; this.lightFlight = null; this.lightPulse = 0;
    this.lightDuration = 0; this.lightPower = 0; this.lightImpact = false;
    this.lightPosition = new B.Vector3(); this.focusPosition = new B.Vector3();
    this.materials = {};
    for (const [name, color] of Object.entries({ hot: '#fff2b9', gold: '#ffbd52', flame: '#ff6a21', ember: '#e54616', afterglow: '#e96b27' })) {
      const material = new B.StandardMaterial(`cinder-${name}`, scene);
      material.emissiveColor = B.Color3.FromHexString(color); material.disableLighting = true;
      material.backFaceCulling = false; material.alphaMode = B.Engine.ALPHA_ADD;
      material.disableDepthWrite = true; this.materials[name] = material;
    }
    const finish = (mesh, material) => {
      mesh.material = material; mesh.isPickable = false; mesh.setEnabled(false);
      return mesh;
    };
    this.flights = Array.from({ length: FLIGHTS }, (_, i) => {
      const corona = finish(this.makeHalo(`cinder-corona-${i}`), this.materials.flame);
      corona.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
      const flame = finish(this.makeFlame(`cinder-flame-${i}`), this.materials.flame);
      const trail = finish(this.makeTrail(`cinder-trail-${i}`), this.materials.gold);
      // Trail vertices are world positions; a fixed initial bounding box must
      // never cull the moving ribbon before its next sample reaches the GPU.
      trail.alwaysSelectAsActiveMesh = true;
      return { corona, flame, trail, projectile: null, serial: 0, age: 0, tailLife: 0,
        x: 0, y: 0, z: 0, sampleX: 0, sampleY: 0, sampleZ: 0, dx: 0, dz: 1,
        points: new Float32Array(TRAIL_POINTS * 3), positions: new Float32Array(TRAIL_POINTS * 12) };
    });
    this.impacts = Array.from({ length: IMPACTS }, (_, i) => ({
      shell: finish(B.MeshBuilder.CreateSphere(`cinder-impact-shell-${i}`, { diameter: 1, segments: 10 }, scene), this.materials.gold),
      ring: finish(this.makeRing(`cinder-pressure-ring-${i}`), this.materials.gold),
      afterglow: finish(this.makeRing(`cinder-afterglow-${i}`), this.materials.afterglow),
      life: 0, duration: 0, age: 0, strength: 1, kind: null,
    }));
    for (const effect of this.impacts) {
      effect.ring.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
      effect.afterglow.rotation.x = Math.PI / 2;
    }
    this.sparks = Array.from({ length: SPARKS }, (_, i) => ({
      mesh: finish(B.MeshBuilder.CreateBox(`cinder-ember-${i}`, { width: .035, height: .13, depth: .035 }, scene), i % 3 ? this.materials.gold : this.materials.hot),
      life: 0, duration: 0, vx: 0, vy: 0, vz: 0, gravity: 0,
    }));
    this.chargeHalo = finish(this.makeHalo('cinder-hand-aura'), this.materials.flame);
    this.chargeHalo.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    this.chargeRing = finish(this.makeRing('cinder-hand-sigil'), this.materials.gold);
    this.chargeRing.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    this.chargeEmber = finish(B.MeshBuilder.CreateSphere('cinder-hand-ember', { diameter: .045, segments: 5 }, scene), this.materials.hot);
    this.light = new B.PointLight('cinder-local-light', new B.Vector3(), scene);
    this.light.diffuse = new B.Color3(1, .38, .075); this.light.specular = new B.Color3(.3, .12, .035);
    this.light.renderPriority = 1; this.light.range = 7; this.light.intensity = 0;
    this.light.includedOnlyMeshes = []; this.light.setEnabled(false);
    this.lightTargetsReady = false;
  }

  makeHalo(name) {
    const positions = [0, 0, 0], colors = [1, 1, 1, .5], indices = [], steps = 32;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < steps; i++) {
      const angle = i * Math.PI * 2 / steps, radius = ring ? .5 : .27;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      colors.push(1, 1, 1, ring ? 0 : .48);
    }
    for (let i = 0; i < steps; i++) {
      const a = i + 1, b = (i + 1) % steps + 1;
      indices.push(0, a, b, a, a + steps, b + steps, a, b + steps, b);
    }
    return this.makeMesh(name, positions, indices, colors);
  }

  makeRing(name) {
    const positions = [], colors = [], indices = [], steps = 40;
    for (let ring = 0; ring < 4; ring++) for (let i = 0; i < steps; i++) {
      const angle = i * Math.PI * 2 / steps, radius = [.73, .81, .94, 1][ring];
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      colors.push(1, 1, 1, ring === 0 || ring === 3 ? 0 : ring === 1 ? .8 : .3);
    }
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < steps; i++) {
      const a = ring * steps + i, b = ring * steps + (i + 1) % steps;
      indices.push(a, a + steps, b + steps, a, b + steps, b);
    }
    return this.makeMesh(name, positions, indices, colors);
  }

  makeFlame(name) {
    const positions = [], colors = [], indices = [];
    // Nine asymmetric tongues stretch behind the core, rather than a second
    // opaque sphere. Their transparent tips keep targets and masonry readable.
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9, spread = .29, n = i * 4;
      positions.push(Math.cos(angle - spread) * .16, Math.sin(angle - spread) * .16, .12,
        Math.cos(angle) * .3, Math.sin(angle) * .3, -.12,
        Math.cos(angle + spread) * .16, Math.sin(angle + spread) * .16, .12,
        Math.cos(angle + .12) * .09, Math.sin(angle + .12) * .09, -.62 - (i % 3) * .13);
      colors.push(1, .9, .7, .65, 1, 1, 1, .35, 1, .9, .7, .65, .9, .2, .04, 0);
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    return this.makeMesh(name, positions, indices, colors);
  }

  makeTrail(name) {
    const positions = new Float32Array(TRAIL_POINTS * 12), colors = [], indices = [];
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const t = i / (TRAIL_POINTS - 1), alpha = .58 * (1 - t);
      for (let v = 0; v < 4; v++) colors.push(1, 1 - t * .64, 1 - t * .94, alpha);
      if (i < TRAIL_POINTS - 1) {
        const n = i * 4;
        indices.push(n, n + 1, n + 4, n + 1, n + 5, n + 4,
          n + 2, n + 3, n + 6, n + 3, n + 7, n + 6);
      }
    }
    return this.makeMesh(name, positions, indices, colors, true);
  }

  makeMesh(name, positions, indices, colors, updatable = false) {
    const mesh = new B.Mesh(name, this.scene), data = new B.VertexData();
    data.positions = positions; data.indices = indices; data.colors = colors;
    data.normals = new Float32Array(positions.length); data.applyToMesh(mesh, updatable);
    mesh.hasVertexAlpha = true; return mesh;
  }

  cacheLightTargets() {
    if (this.lightTargetsReady) return;
    // Include only merged original architecture and substantial actor surfaces.
    // No existing light, mesh, material or world setting is modified.
    const targets = this.light.includedOnlyMeshes;
    for (const mesh of this.scene.meshes) {
      if (targets.length >= LIGHT_TARGETS) break;
      if (mesh.material?.disableLighting || mesh.name.startsWith('cinder-')) continue;
      if (mesh.name === 'merged-vault-architecture' || /^(hero|guardian|gladiator)-(cuirass|breastplate|pauldron|visor|helm|shield-face|bracer|greave)/.test(mesh.name)) targets.push(mesh);
    }
    this.lightTargetsReady = true;
  }

  charge(fighter, readiness, settings) {
    if (this.disposed) return;
    this.chargeReadiness = clamp01(Number.isFinite(readiness) ? readiness : 0);
    if (!fighter?.focus || this.chargeReadiness <= 0) { this.hideCharge(); return; }
    fighter.focus.computeWorldMatrix(true);
    this.focusPosition.copyFrom(fighter.focus.getAbsolutePosition());
    const yaw = fighter.root.rotation.y;
    this.focusPosition.x += Math.sin(yaw) * .15; this.focusPosition.z += Math.cos(yaw) * .15;
    const ready = this.chargeReadiness, reduced = settings.reducedMotion;
    this.chargeHalo.position.copyFrom(this.focusPosition);
    this.chargeHalo.scaling.setAll((reduced ? .19 : .27) + ready * (reduced ? .1 : .22));
    this.chargeHalo.visibility = .24 + ready * .32; this.chargeHalo.setEnabled(true);
    this.chargeRing.position.copyFrom(this.focusPosition);
    this.chargeRing.scaling.setAll(.075 + ready * .075);
    this.chargeRing.rotation.z = this.time * .65; this.chargeRing.visibility = .22 + ready * .34;
    this.chargeRing.setEnabled(!reduced);
    this.chargeEmber.position.set(this.focusPosition.x + Math.cos(this.time * 2.4) * .12,
      this.focusPosition.y + Math.sin(this.time * 2.4) * .12, this.focusPosition.z);
    this.chargeEmber.visibility = ready * .7;
    this.chargeEmber.setEnabled(!reduced && settings.quality !== 'low');
  }

  hideCharge() {
    this.chargeHalo.setEnabled(false); this.chargeRing.setEnabled(false); this.chargeEmber.setEnabled(false);
  }

  launch(projectile, settings) {
    if (this.disposed || !projectile?.mesh || projectile.mesh.isDisposed()) return false;
    let slot = this.flights[0];
    for (const candidate of this.flights) {
      if (!candidate.projectile && candidate.tailLife <= 0) { slot = candidate; break; }
      if (candidate.serial < slot.serial) slot = candidate;
    }
    this.releaseFlight(slot, false);
    slot.projectile = projectile; slot.serial = ++this.serial; slot.age = 0; slot.tailLife = 0;
    slot.x = slot.sampleX = projectile.mesh.position.x;
    slot.y = slot.sampleY = projectile.mesh.position.y;
    slot.z = slot.sampleZ = projectile.mesh.position.z;
    slot.dx = projectile.dx; slot.dz = projectile.dz;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const n = i * 3; slot.points[n] = slot.x; slot.points[n + 1] = slot.y; slot.points[n + 2] = slot.z;
    }
    slot.corona.parent = projectile.mesh; slot.corona.position.setAll(0);
    slot.flame.parent = projectile.mesh; slot.flame.position.setAll(0);
    slot.flame.rotation.set(0, Math.atan2(projectile.dx, projectile.dz), 0);
    if (projectile.material?.emissiveColor) projectile.material.emissiveColor.set(1, .72, .3);
    this.hideCharge(); this.chargeReadiness = 0; this.lastEvent = 'launch';
    this.lightFlight = slot; this.lightPulse = this.lightDuration = .18;
    this.lightPower = 1.7; this.lightImpact = false;
    this.cacheLightTargets(); this.presentFlight(slot, settings); this.applyLight(settings);
    return true;
  }

  travel(projectile, dt, settings) {
    if (this.disposed) return;
    for (const slot of this.flights) {
      if (slot.projectile !== projectile) continue;
      slot.age += Math.max(0, dt); slot.x = projectile.mesh.position.x;
      slot.y = projectile.mesh.position.y; slot.z = projectile.mesh.position.z;
      if (settings.reducedMotion) {
        for (let i = 0; i < TRAIL_POINTS; i++) {
          const n = i * 3; slot.points[n] = slot.x; slot.points[n + 1] = slot.y; slot.points[n + 2] = slot.z;
        }
        slot.sampleX = slot.x; slot.sampleY = slot.y; slot.sampleZ = slot.z;
      } else {
        const dx = slot.x - slot.sampleX, dy = slot.y - slot.sampleY, dz = slot.z - slot.sampleZ;
        const distance = Math.hypot(dx, dy, dz), samples = Math.min(TRAIL_POINTS - 1, Math.floor(distance / .19));
        const sx = slot.sampleX, sy = slot.sampleY, sz = slot.sampleZ;
        for (let i = 1; i <= samples; i++) {
          for (let n = TRAIL_POINTS - 1; n > 0; n--) {
            const a = n * 3, b = a - 3;
            slot.points[a] = slot.points[b]; slot.points[a + 1] = slot.points[b + 1]; slot.points[a + 2] = slot.points[b + 2];
          }
          const t = i * .19 / distance;
          slot.points[0] = sx + dx * t; slot.points[1] = sy + dy * t; slot.points[2] = sz + dz * t;
        }
        if (samples) { slot.sampleX = slot.points[0]; slot.sampleY = slot.points[1]; slot.sampleZ = slot.points[2]; }
      }
      this.presentFlight(slot, settings);
      if (!this.lightImpact && slot === this.lightFlight) this.light.position.set(slot.x, slot.y, slot.z);
      return;
    }
  }

  presentFlight(slot, settings) {
    const reduced = settings.reducedMotion, low = settings.quality === 'low';
    slot.corona.setEnabled(true); slot.corona.scaling.setAll(reduced ? .74 : low ? .96 : 1.14);
    slot.corona.visibility = reduced ? .46 : .7;
    slot.flame.setEnabled(!reduced); slot.flame.visibility = low ? .55 : .82;
    slot.flame.rotation.z = reduced ? 0 : slot.age * 2.5;
    slot.trail.setEnabled(!reduced && slot.age > 0);
    if (!reduced) this.writeTrail(slot, low, 1);
  }

  writeTrail(slot, low, fade) {
    const count = low ? 5 : TRAIL_POINTS, width = low ? .11 : .16;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const point = Math.min(i, count - 1), p = point * 3, n = i * 12;
      const x = i ? slot.points[p] : slot.x, y = i ? slot.points[p + 1] : slot.y, z = i ? slot.points[p + 2] : slot.z;
      const radius = i < count ? width * (1 - i / (count - 1)) : 0;
      const sideX = slot.dz * radius, sideZ = -slot.dx * radius;
      slot.positions[n] = x - sideX; slot.positions[n + 1] = y; slot.positions[n + 2] = z - sideZ;
      slot.positions[n + 3] = x + sideX; slot.positions[n + 4] = y; slot.positions[n + 5] = z + sideZ;
      slot.positions[n + 6] = x; slot.positions[n + 7] = y - radius; slot.positions[n + 8] = z;
      slot.positions[n + 9] = x; slot.positions[n + 10] = y + radius; slot.positions[n + 11] = z;
    }
    slot.trail.updateVerticesData(B.VertexBuffer.PositionKind, slot.positions, false, false);
    slot.trail.visibility = fade;
  }

  releaseFlight(slot, leaveTail) {
    slot.projectile = null; slot.corona.parent = null; slot.flame.parent = null;
    slot.corona.setEnabled(false); slot.flame.setEnabled(false);
    slot.tailLife = leaveTail && slot.trail.isEnabled() ? .16 : 0;
    if (!slot.tailLife) slot.trail.setEnabled(false);
    if (this.lightFlight === slot) this.lightFlight = null;
  }

  impact(position, kind, settings) {
    if (this.disposed || !position) return;
    kind = kind === 'hit' || kind === 'wall' ? kind : 'expired'; this.lastEvent = kind;
    for (const slot of this.flights) {
      if (slot.projectile && Math.hypot(slot.projectile.mesh.position.x - position.x, slot.projectile.mesh.position.y - position.y,
        slot.projectile.mesh.position.z - position.z) < .05) this.releaseFlight(slot, !settings.reducedMotion);
    }
    const reduced = settings.reducedMotion, low = settings.quality === 'low';
    const effect = this.impacts[this.impactCursor++ % IMPACTS];
    effect.kind = kind; effect.age = 0; effect.strength = kind === 'hit' ? 1 : kind === 'wall' ? .73 : .4;
    effect.duration = effect.life = reduced ? .34 : kind === 'hit' ? .9 : kind === 'wall' ? .7 : .45;
    effect.shell.position.copyFrom(position); effect.ring.position.copyFrom(position);
    effect.afterglow.position.set(position.x, .045, position.z);
    this.presentImpact(effect, settings);
    const count = reduced ? 2 : low ? (kind === 'hit' ? 7 : kind === 'wall' ? 5 : 2) : kind === 'hit' ? 14 : kind === 'wall' ? 10 : 4;
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.sparkCursor++ % SPARKS], angle = i * 2.399963;
      const speed = (2.2 + (i % 4) * .62) * effect.strength;
      spark.duration = spark.life = reduced ? .17 : .28 + (i % 4) * .055;
      spark.vx = reduced ? 0 : Math.cos(angle) * speed; spark.vz = reduced ? 0 : Math.sin(angle) * speed;
      spark.vy = reduced ? 0 : .8 + (i % 3) * .72; spark.gravity = reduced ? 0 : 4.8;
      spark.mesh.position.set(position.x + (reduced ? (i ? .11 : -.11) : 0), position.y, position.z);
      spark.mesh.rotation.set(Math.cos(angle) * .8, angle, Math.sin(angle) * .8);
      spark.mesh.scaling.set(reduced ? .8 : 1, reduced ? .45 : 1.1 + (i % 3) * .3, reduced ? .8 : 1);
      spark.mesh.visibility = reduced ? .45 : .95; spark.mesh.setEnabled(true);
    }
    this.lightPosition.copyFrom(position); this.lightImpact = true;
    this.lightPulse = this.lightDuration = reduced ? .2 : kind === 'expired' ? .18 : .3;
    this.lightPower = kind === 'hit' ? 4.2 : kind === 'wall' ? 3 : 1.2;
    this.cacheLightTargets(); this.applyLight(settings);
  }

  presentImpact(effect, settings) {
    const reduced = settings.reducedMotion, low = settings.quality === 'low', age = effect.age;
    const strength = effect.strength, contact = Math.max(0, 1 - age / (reduced ? .2 : .34));
    const size = reduced ? .45 : (.48 + Math.min(1, age / .28) * 1.7) * strength;
    effect.shell.setEnabled(contact > 0); effect.shell.scaling.setAll(size * (low ? .85 : 1));
    effect.shell.visibility = contact * (reduced ? .11 : .24);
    effect.ring.setEnabled(!reduced && effect.kind !== 'expired' && contact > 0);
    effect.ring.scaling.setAll((.23 + Math.min(1, age / .3) * 1.24) * strength);
    effect.ring.visibility = contact * (low ? .55 : .82);
    effect.afterglow.setEnabled(effect.life > 0);
    effect.afterglow.scaling.setAll(reduced ? .42 : (.4 + Math.min(1, age / .35) * .52) * strength);
    effect.afterglow.visibility = Math.max(0, effect.life / effect.duration) * (reduced ? .14 : low ? .22 : .34);
  }

  update(dt, settings) {
    if (this.disposed) return;
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0; this.time += dt;
    this.lightPulse = Math.max(0, this.lightPulse - dt);
    if (!this.lightPulse) this.lightImpact = false;
    let active = 0;
    const budget = settings.reducedMotion ? 2 : settings.quality === 'low' ? 7 : SPARKS;
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life = Math.max(0, spark.life - dt);
      if (active++ >= budget) spark.life = 0;
      if (!spark.life) { spark.mesh.setEnabled(false); continue; }
      if (settings.reducedMotion) { spark.vx = spark.vy = spark.vz = spark.gravity = 0; }
      spark.mesh.position.x += spark.vx * dt; spark.mesh.position.y += spark.vy * dt; spark.mesh.position.z += spark.vz * dt;
      spark.vy -= spark.gravity * dt;
      spark.mesh.visibility = spark.life / spark.duration * (settings.reducedMotion ? .45 : .95);
    }
    for (const effect of this.impacts) {
      if (effect.life <= 0) continue;
      effect.life = Math.max(0, effect.life - dt); effect.age += dt;
      this.presentImpact(effect, settings);
    }
    for (const slot of this.flights) {
      if (slot.projectile?.mesh.isDisposed()) this.releaseFlight(slot, false);
      if (slot.projectile) this.presentFlight(slot, settings);
      else if (slot.tailLife > 0) {
        slot.tailLife = settings.reducedMotion ? 0 : Math.max(0, slot.tailLife - dt);
        slot.trail.setEnabled(slot.tailLife > 0);
        if (slot.tailLife) this.writeTrail(slot, settings.quality === 'low', slot.tailLife / .16);
      }
    }
    if (settings.reducedMotion) { this.chargeRing.setEnabled(false); this.chargeEmber.setEnabled(false); }
    else if (settings.quality === 'low') this.chargeEmber.setEnabled(false);
    this.applyLight(settings);
  }

  applyLight(settings) {
    const reduced = settings.reducedMotion, low = settings.quality === 'low';
    if (!this.lightFlight?.projectile) {
      this.lightFlight = null;
      for (const slot of this.flights) if (slot.projectile && (!this.lightFlight || slot.serial > this.lightFlight.serial)) this.lightFlight = slot;
    }
    let intensity = this.lightFlight ? (reduced ? .2 : low ? .48 : .82) : 0;
    if (this.lightPulse > 0) {
      const t = this.lightPulse / this.lightDuration;
      intensity = Math.max(intensity, Math.min(reduced ? .65 : low ? 2.4 : 4.2, this.lightPower) * t * t);
    }
    if (this.lightImpact && this.lightPulse) this.light.position.copyFrom(this.lightPosition);
    else if (this.lightFlight) this.light.position.set(this.lightFlight.x, this.lightFlight.y, this.lightFlight.z);
    this.light.range = reduced ? 3.4 : low ? 5.5 : 7;
    this.light.intensity = intensity; this.light.setEnabled(intensity > 0);
  }

  snapshot() {
    let activeProjectiles = 0, activeTrails = 0, activeSparks = 0, activeImpacts = 0;
    for (const slot of this.flights) { if (slot.projectile) activeProjectiles++; if (slot.trail.isEnabled()) activeTrails++; }
    for (const spark of this.sparks) if (spark.life > 0) activeSparks++;
    for (const effect of this.impacts) if (effect.life > 0) activeImpacts++;
    return { activeProjectiles, activeTrails, activeSparks, activeImpacts, chargeVisible: this.chargeHalo.isEnabled(),
      chargeReadiness: this.chargeReadiness, lightIntensity: this.light.intensity, lightRange: this.light.range,
      lightTargets: this.light.includedOnlyMeshes.length, lastEvent: this.lastEvent,
      poolMeshes: 37, poolMaterials: 5, poolLights: 1, disposed: this.disposed };
  }

  clear() {
    if (this.disposed) return;
    for (const slot of this.flights) this.releaseFlight(slot, false);
    for (const spark of this.sparks) { spark.life = 0; spark.mesh.setEnabled(false); }
    for (const effect of this.impacts) {
      effect.life = 0; effect.shell.setEnabled(false); effect.ring.setEnabled(false); effect.afterglow.setEnabled(false);
    }
    this.hideCharge(); this.chargeReadiness = 0; this.lightPulse = 0; this.lightImpact = false;
    this.lightFlight = null; this.light.intensity = 0; this.light.setEnabled(false); this.lastEvent = null;
  }

  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    for (const slot of this.flights) { slot.corona.dispose(); slot.flame.dispose(); slot.trail.dispose(); }
    for (const spark of this.sparks) spark.mesh.dispose();
    for (const effect of this.impacts) { effect.shell.dispose(); effect.ring.dispose(); effect.afterglow.dispose(); }
    this.chargeHalo.dispose(); this.chargeRing.dispose(); this.chargeEmber.dispose(); this.light.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
