import { createWorld } from './world.js';
import { createFighter } from './actors.js';
import { GameUI } from './ui.js';
import { Inventory, createDemoResearchProvider } from './loot.js';
import { ATTACKS, DODGE, canAct, inAttackArc, resolveDefense } from './combat.js';
import { VaultAudio } from './audio.js';
import { checkContributorAccess } from './access.js';

const B = window.BABYLON;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const approachAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const canvas = document.getElementById('game-canvas');
const defaults = { quality: 'high', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, volume: .35 };
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('orca-legends-settings') || '{}') }; } catch {}

class VaultGame {
  constructor() {
    this.keys = new Set(); this.mouseBlock = false; this.yaw = 0; this.pitch = .56; this.zoom = 8.4;
    this.time = 0; this.phase = 'loading'; this.opened = new Set(); this.effects = []; this.projectiles = [];
    this.audio = new VaultAudio(settings.volume); this.inventory = new Inventory(); this.provider = createDemoResearchProvider();
    this.ui = new GameUI({
      onStart: () => this.start(), onResume: () => this.resume(), onRestart: () => this.restart(),
      onEquip: id => { if (this.inventory.equip(id)) { this.equipHero(); this.ui.showInventory(this.inventory.list(), this.inventory.equipped); this.audio.play('block'); } },
      onSetting: (key, value) => this.setSetting(key, value),
      onInventory: () => { this.keys.clear(); this.mouseBlock = false; this.ui.showInventory(this.inventory.list(), this.inventory.equipped); },
      onPause: () => this.pause(),
      onCheckAccess: () => this.checkAccess(),
    });
    this.ui.setSettings(settings); this.ui.setLoading(0, 'Verifying contributor access…');
  }
  async checkAccess() {
    if (this.checkingAccess) return;
    this.checkingAccess = true;
    try {
      this.access = await checkContributorAccess(); this.ui.setAccess(this.access);
      if (this.access.allowed && !this.engine) await this.init();
      else if (!this.access.allowed) this.ui.setLoading(0, 'Complete the contributor steps above, then recheck eligibility.');
    } catch (error) { this.fail(error); }
    finally { this.checkingAccess = false; }
  }
  async init() {
    this.ui.setLoading(.12, 'Lighting the ancient treasury…');
    if (!B || !B.Engine.isSupported()) throw new Error('WebGL is unavailable. Enable hardware acceleration in a modern desktop browser and reload.');
    this.engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, powerPreference: 'high-performance', adaptToDeviceRatio: false });
    this.engine.setHardwareScalingLevel(settings.quality === 'high' ? Math.max(1, devicePixelRatio / 1.5) : 1.6);
    this.scene = new B.Scene(this.engine); this.scene.clearColor = new B.Color4(.025, .022, .02, 1);
    this.camera = new B.FreeCamera('expedition-camera', new B.Vector3(0, 6, -21), this.scene);
    this.camera.minZ = .15; this.camera.maxZ = 100; this.camera.fov = .9;
    this.world = createWorld(this.scene, settings);
    this.ui.setLoading(.65, 'Awakening the vault warden…');
    this.hero = createFighter(this.scene, { kind: 'hero', name: 'The Seeker' });
    this.guardian = this.makeEnemy('guardian', 'AURIC WARDEN', 145, 0, 8);
    this.gladiator = this.makeEnemy('gladiator', 'VARR — THE GILDED OATH', 215, 0, 43);
    this.gladiator.actor.setVisible(false);
    this.equipHero(); this.resetPlayer(); this.updateCamera(1, true);
    this.bindControls();
    await this.scene.whenReadyAsync(); this.phase = 'start'; this.ui.showStart();
    this.ui.setLoading(1, 'The Vault is ready.');
    this.engine.runRenderLoop(() => {
      const dt = Math.min(.05, this.engine.getDeltaTime() / 1000);
      try { this.frame(dt); this.scene.render(); } catch (error) { this.fail(error); }
    });
    if (new URLSearchParams(location.search).has('test')) this.installTestInterface();
  }
  makeEnemy(kind, name, maxHealth, x, z) {
    const actor = createFighter(this.scene, { kind, name }); actor.root.position.set(x, 0, z);
    return { kind, name, actor, health: maxHealth, maxHealth, x, z, yaw: Math.PI, cooldown: 1.6, action: null, stagger: 0, guard: false, hit: 0, attacks: 0, dead: false };
  }
  resetPlayer() {
    this.player = { x: 0, z: -14, yaw: 0, vx: 0, vz: 0, health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, mana: 100, maxMana: 100, action: null, blockTime: 99, blocking: false, hit: 0, regenDelay: 0, spellCooldown: 0 };
    this.hero.root.position.set(0, 0, -14); this.hero.root.rotation.y = 0; this.yaw = 0;
  }
  equipHero() {
    const e = this.inventory.equipped;
    this.hero.equip({ weapon: this.inventory.items.get(e.weapon), shield: this.inventory.items.get(e.shield), spell: this.inventory.items.get(e.spell) });
  }
  start() {
    if (!this.access?.allowed) return;
    this.phase = 'explore'; this.ui.hideModal(); this.audio.start();
    this.ui.toast('THE VAULT', 'Find three research relics. Defeat the Warden. Earn your place in the Coliseum.');
    canvas.focus();
  }
  resume() { this.ui.hideModal(); this.keys.clear(); this.mouseBlock = false; canvas.focus(); this.audio.start(); }
  pause() { if (!['explore', 'arena', 'intro'].includes(this.phase)) return; this.keys.clear(); this.mouseBlock = false; this.ui.showPause(); }
  restart() {
    this.ui.hideModal(); this.keys.clear(); this.mouseBlock = false; this.opened.clear(); this.inventory.reset(); this.equipHero(); this.resetPlayer();
    for (const enemy of [this.guardian, this.gladiator]) {
      enemy.health = enemy.maxHealth; enemy.dead = false; enemy.stagger = 0; enemy.cooldown = 1.6; enemy.action = null; enemy.hit = 0; enemy.attacks = 0; enemy.guard = false;
      enemy.x = 0; enemy.z = enemy.kind === 'guardian' ? 8 : 43; enemy.yaw = Math.PI; enemy.actor.root.position.set(enemy.x, 0, enemy.z); enemy.actor.root.rotation.set(0, Math.PI, 0);
      enemy.actor.setVisible(enemy.kind === 'guardian');
    }
    for (const chest of this.world.chests) chest.lid.rotation.x = 0;
    this.world.setGateOpen(false); this.clearEffects(); this.phase = 'explore'; this.time = 0; this.introTimer = 0; this.yaw = 0;
    this.updateCamera(1, true);
    this.audio.start(); canvas.focus(); this.ui.toast('A NEW EXPEDITION', 'Your knowledge remains. Your adventure begins again.');
  }
  setSetting(key, value) {
    if (!(key in defaults)) return;
    settings[key] = key === 'volume' ? clamp(Number(value), 0, 1) : value;
    if (key === 'volume') this.audio.volume = settings.volume;
    if (key === 'quality') this.engine?.setHardwareScalingLevel(settings.quality === 'high' ? Math.max(1, devicePixelRatio / 1.5) : 1.6);
    try { localStorage.setItem('orca-legends-settings', JSON.stringify(settings)); } catch {}
  }
  bindControls() {
    this.abort = new AbortController(); const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      if (!this.ui.isModalOpen() && ['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Escape') { this.ui.isModalOpen() ? (['explore', 'arena', 'intro'].includes(this.phase) && this.resume()) : this.pause(); return; }
      if (event.code === 'KeyI' && ['explore', 'arena'].includes(this.phase)) {
        if (this.ui.isModalOpen()) this.resume(); else { this.keys.clear(); this.mouseBlock = false; this.ui.showInventory(this.inventory.list(), this.inventory.equipped); } return;
      }
      if (this.ui.isModalOpen()) return;
      this.keys.add(event.code);
      if (event.code === 'Space') this.dodge();
      if (event.code === 'KeyR') this.attack('heavy');
      if (event.code === 'KeyF') this.cast();
      if (event.code === 'KeyE') this.interact();
      if (event.code === 'KeyM') { this.setSetting('volume', settings.volume > 0 ? 0 : .35); this.ui.toast(settings.volume ? 'SOUND ON' : 'SOUND MUTED'); }
    }, opts);
    window.addEventListener('keyup', event => this.keys.delete(event.code), opts);
    canvas.addEventListener('contextmenu', event => event.preventDefault(), opts);
    canvas.addEventListener('pointerdown', event => {
      if (this.ui.isModalOpen()) return;
      canvas.focus(); this.audio.start();
      if (event.button === 0) { this.attack('light'); if (document.pointerLockElement !== canvas) { try { const request = canvas.requestPointerLock?.(); request?.catch?.(() => {}); } catch {} } }
      if (event.button === 2) this.mouseBlock = true;
    }, opts);
    window.addEventListener('pointerup', event => { if (event.button === 2) this.mouseBlock = false; }, opts);
    window.addEventListener('pointermove', event => {
      const dx = event.clientX - (this.lastMouseX ?? event.clientX), dy = event.clientY - (this.lastMouseY ?? event.clientY);
      this.lastMouseX = event.clientX; this.lastMouseY = event.clientY;
      if (this.ui.isModalOpen()) return;
      if (document.pointerLockElement === canvas || (event.buttons & 4)) {
        const locked = document.pointerLockElement === canvas;
        this.yaw += (locked ? event.movementX : dx) * .0035; this.pitch = clamp(this.pitch + (locked ? event.movementY : dy) * .002, .25, 1.02);
      }
    }, opts);
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom = clamp(this.zoom + event.deltaY * .008, 5.5, 11); }, { ...opts, passive: false });
    window.addEventListener('resize', () => this.engine.resize(), opts);
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseBlock = false; if (['explore', 'arena'].includes(this.phase) && !this.ui.isModalOpen()) this.pause(); }, opts);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, opts);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (this.hadPointerLock && !locked && !this.ui.isModalOpen()) this.pause();
      this.hadPointerLock = locked;
    }, opts);
    window.addEventListener('pagehide', () => this.dispose(), { ...opts, once: true });
  }
  activeEnemy() { return this.phase === 'arena' || this.phase === 'intro' ? this.gladiator : this.guardian; }
  attack(type) {
    if (!['explore', 'arena'].includes(this.phase) || this.ui.isModalOpen()) return false;
    const p = this.player, spec = ATTACKS[type]; if (!canAct(p, spec.stamina)) return false;
    p.stamina -= spec.stamina; p.regenDelay = .7; p.blocking = false; p.action = { type, elapsed: 0, duration: spec.duration, dealt: false };
    const enemy = this.activeEnemy();
    if (!enemy.dead && dist(p, enemy) < 5) p.yaw = Math.atan2(enemy.x - p.x, enemy.z - p.z);
    this.audio.play('swing'); return true;
  }
  dodge() {
    const p = this.player; if (!['explore', 'arena'].includes(this.phase) || !canAct(p, DODGE.stamina)) return false;
    p.stamina -= DODGE.stamina; p.regenDelay = .8;
    let v = this.movementVector(); if (Math.hypot(v.x, v.z) < .1) v = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    p.action = { type: 'dodge', elapsed: 0, duration: DODGE.duration, dx: v.x, dz: v.z }; return true;
  }
  cast() {
    const p = this.player; if (!['explore', 'arena'].includes(this.phase) || p.health <= 0 || p.mana < 28 || p.spellCooldown > 0 || p.action) return false;
    p.mana -= 28; p.spellCooldown = 3.6; const enemy = this.activeEnemy();
    const target = !enemy.dead && dist(p, enemy) < 22 ? enemy : { x: p.x + Math.sin(p.yaw) * 14, z: p.z + Math.cos(p.yaw) * 14 };
    p.yaw = Math.atan2(target.x - p.x, target.z - p.z);
    const mesh = B.MeshBuilder.CreateSphere('knowledge-bolt', { diameter: .4, segments: 8 }, this.scene);
    mesh.position.set(p.x, 1.2, p.z); const material = new B.StandardMaterial('bolt-mat', this.scene); material.emissiveColor = B.Color3.FromHexString(this.inventory.items.get(this.inventory.equipped.spell)?.appearance.color || '#84eddf'); material.disableLighting = true; mesh.material = material;
    const len = Math.hypot(target.x - p.x, target.z - p.z) || 1;
    this.projectiles.push({ mesh, material, dx: (target.x - p.x) / len, dz: (target.z - p.z) / len, life: 1.6, enemy, damage: this.inventory.getStats().spellDamage });
    this.audio.play('spell'); return true;
  }
  movementVector() {
    const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')), z = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const len = Math.hypot(x, z) || 1;
    return { x: (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) / len, z: (z * Math.cos(this.yaw) - x * Math.sin(this.yaw)) / len };
  }
  canWalk(x, z, radius = .48) {
    if (!this.world.isWalkable(x, z, radius)) return false;
    if (!this.arenaUnlocked() && z > 22) return false;
    if (this.phase === 'arena' && z < 28.2) return false;
    return true;
  }
  move(entity, dx, dz, radius = .48) {
    // Substeps prevent sprint/dodge tunnelling; separate axes slide naturally along masonry.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .18));
    for (let i = 0; i < steps; i++) {
      if (this.canWalk(entity.x + dx / steps, entity.z, radius)) entity.x += dx / steps;
      if (this.canWalk(entity.x, entity.z + dz / steps, radius)) entity.z += dz / steps;
    }
  }
  arenaUnlocked() { return this.opened.size === 3 && this.guardian.dead; }
  async interact() {
    if (this.ui.isModalOpen() || this.phase !== 'explore' || this.interacting) return;
    const chest = this.nearChest(); if (!chest) return;
    if (chest.id === 'earnings' && !this.guardian.dead) { this.ui.toast('SEALED BY THE WARDEN', 'Defeat the Auric Warden to claim the treasury sword.'); return; }
    this.interacting = true;
    try {
      const item = await this.provider.getLoot(chest.id);
      if (!item) throw new Error('This demonstration chest has no available item.');
      this.inventory.add(item); this.opened.add(chest.id); chest.openTime = this.time;
      this.player.health = Math.min(100, this.player.health + 24); this.player.mana = Math.min(100, this.player.mana + 25);
      this.burst(chest.position.x, 1.2, chest.position.z, '#ffdc79', 20); this.revealLoot(item, chest.position); this.audio.play('chest');
      this.ui.toast(item.name, `${item.rarity} ${item.slot} discovered · I to inspect and equip · DEMO research`, item.rarity.toLowerCase());
      this.world.setGateOpen(this.arenaUnlocked());
      if (this.arenaUnlocked()) this.ui.toast('THE COLISEUM AWAITS', 'The northern seal is broken. Enter the passage beyond the treasury.');
    } catch (error) { this.ui.toast('CHEST UNAVAILABLE', error.message); } finally { this.interacting = false; }
  }
  nearChest() { return this.world.chests.find(c => !this.opened.has(c.id) && Math.hypot(c.position.x - this.player.x, c.position.z - this.player.z) < 3.1); }
  frame(dt) {
    const playing = ['explore', 'arena', 'intro'].includes(this.phase) && !this.ui.isModalOpen();
    if (playing) {
      this.time += dt; this.world.update(dt, this.time); this.updatePlayer(dt); this.updateEffects(dt);
      if (this.phase !== 'intro') this.updateEnemy(this.activeEnemy(), dt);
      if (this.phase === 'explore' && this.arenaUnlocked() && this.player.z > 29) this.enterArena();
      if (this.phase === 'intro') { this.introTimer -= dt; if (this.introTimer <= 0) { this.phase = 'arena'; this.ui.toast('FIGHT', 'Watch the windup. A timed guard turns their strength against them.'); } }
      for (const chest of this.world.chests) if (this.opened.has(chest.id)) chest.lid.rotation.x = -1.45 * Math.min(1, (this.time - (chest.openTime ?? 0)) / .7);
      this.updateCamera(dt);
    } else if (this.phase === 'won' || this.phase === 'lost') {
      this.time += dt; this.hero.update(dt, { dead: this.phase === 'lost', victory: this.phase === 'won', time: this.time });
      const enemy = this.player.z > 27 ? this.gladiator : this.guardian;
      enemy.actor.update(dt, { dead: enemy.dead, victory: !enemy.dead, time: this.time });
    }
    this.refreshHUD();
  }
  updatePlayer(dt) {
    const p = this.player, vector = this.movementVector();
    const wasBlocking = p.blocking;
    p.blocking = (this.mouseBlock || this.keys.has('KeyQ')) && !p.action && p.stamina > 2 && this.phase !== 'intro';
    p.blockTime = p.blocking ? (wasBlocking ? p.blockTime + dt : 0) : 99;
    p.hit = Math.max(0, p.hit - dt); p.spellCooldown = Math.max(0, p.spellCooldown - dt); p.regenDelay = Math.max(0, p.regenDelay - dt);
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.stamina > 2 && !p.action && !p.blocking && Math.hypot(vector.x, vector.z) > .1;
    if (sprinting) { p.stamina = Math.max(0, p.stamina - 16 * dt); p.regenDelay = .4; }
    else if (p.regenDelay === 0) p.stamina = Math.min(100, p.stamina + (p.blocking ? 8 : 25) * dt);
    p.mana = Math.min(100, p.mana + 5 * dt);
    let speed = sprinting ? 6 : p.blocking ? 2 : 3.5;
    if (p.action) speed *= .3;
    if (this.phase === 'intro') speed = 0;
    const smoothing = 1 - Math.exp(-16 * dt);
    p.vx += (vector.x * speed - p.vx) * smoothing; p.vz += (vector.z * speed - p.vz) * smoothing;
    if (p.action?.type === 'dodge') this.move(p, p.action.dx * DODGE.speed * dt, p.action.dz * DODGE.speed * dt);
    else this.move(p, p.vx * dt, p.vz * dt);
    if (Math.hypot(vector.x, vector.z) > .1 && !p.action && !p.blocking) p.yaw = approachAngle(p.yaw, Math.atan2(vector.x, vector.z), dt * 18);
    if (p.blocking) { const enemy = this.activeEnemy(); if (!enemy.dead && dist(p, enemy) < 6) p.yaw = approachAngle(p.yaw, Math.atan2(enemy.x - p.x, enemy.z - p.z), dt * 16); }
    if (p.action) {
      const action = p.action;
      action.elapsed += dt; const spec = ATTACKS[action.type];
      if (spec && !action.dealt && action.elapsed >= spec.impact) { action.dealt = true; this.meleeImpact(action.type); }
      if (p.action === action && action.elapsed >= action.duration) p.action = null;
    }
    this.hero.root.position.set(p.x, 0, p.z); this.hero.root.rotation.y = p.yaw;
    this.hero.update(dt, { moving: Math.hypot(p.vx, p.vz) > .25, sprinting, attacking: !!ATTACKS[p.action?.type], attackProgress: p.action ? p.action.elapsed / p.action.duration : 0, heavy: p.action?.type === 'heavy', blocking: p.blocking, dodging: p.action?.type === 'dodge', hit: p.hit > 0, time: this.time });
    if (Math.hypot(p.vx, p.vz) > 1 && this.time > (this.nextStep || 0)) { this.audio.play('step'); this.nextStep = this.time + (sprinting ? .27 : .42); }
  }
  meleeImpact(type) {
    const enemy = this.activeEnemy(), p = this.player, spec = ATTACKS[type];
    if (enemy.dead || !inAttackArc(p, enemy, spec.reach)) return;
    let damage = Math.round(this.inventory.getStats().damage * spec.multiplier);
    if (enemy.guard && type !== 'heavy') { damage = Math.round(damage * .3); this.audio.play('block'); this.ui.toast('GUARDED', 'Heavy strikes break the Warden’s defense.'); }
    else {
      // Committed windups resist light-hit stun locks. Heavy attacks and parries interrupt.
      if (type === 'heavy' || !enemy.action) { enemy.stagger = spec.stagger; enemy.action = null; }
      this.audio.play('hit');
    }
    this.hurtEnemy(enemy, damage, type === 'heavy' ? '#ffd27a' : '#ffe8c3');
  }
  hurtEnemy(enemy, damage, color) {
    if (enemy.dead) return;
    enemy.health = Math.max(0, enemy.health - damage); enemy.hit = .23;
    this.burst(enemy.x, 1.5, enemy.z, color, 9); this.damageText(enemy.x, 2.5, enemy.z, String(damage), color);
    if (enemy.health === 0) {
      enemy.dead = true; enemy.action = null; enemy.guard = false;
      this.burst(enemy.x, 1.3, enemy.z, '#f9d67b', 24); this.audio.play('win');
      if (enemy.kind === 'guardian') {
        this.player.health = Math.min(100, this.player.health + 35);
        this.ui.toast('THE WARDEN FALLS', 'The Earnings chest is unsealed. Claim the sword at the northern altar.', 'legendary');
        this.world.setGateOpen(this.arenaUnlocked());
      } else this.finish(true);
    }
  }
  updateEnemy(enemy, dt) {
    enemy.hit = Math.max(0, enemy.hit - dt);
    if (enemy.dead) { enemy.actor.update(dt, { dead: true, time: this.time }); return; }
    const p = this.player, distance = dist(enemy, p);
    enemy.stagger = Math.max(0, enemy.stagger - dt); enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (enemy.action) {
      enemy.action.elapsed += dt; const a = enemy.action;
      if (a.elapsed < .27) enemy.yaw = approachAngle(enemy.yaw, Math.atan2(p.x - enemy.x, p.z - enemy.z), dt * 9);
      if (!a.dealt && a.elapsed >= a.windup) {
        a.dealt = true;
        if (a.type === 'shockwave') {
          this.ring(enemy.x, enemy.z, '#ef7857', 5.5); this.audio.play('hit');
          if (distance < 5.5) this.hurtPlayer(enemy, 25, true);
        } else if (inAttackArc(enemy, p, enemy.kind === 'guardian' ? 3.25 : 3.5, 1.02)) this.hurtPlayer(enemy, enemy.kind === 'guardian' ? 23 : 27);
      }
      if (a.elapsed >= a.duration) { enemy.action = null; enemy.cooldown = enemy.kind === 'guardian' ? 1.05 : .82; }
    } else if (enemy.stagger === 0 && distance < (enemy.kind === 'guardian' ? 15 : 30)) {
      enemy.yaw = approachAngle(enemy.yaw, Math.atan2(p.x - enemy.x, p.z - enemy.z), dt * 5);
      enemy.guard = enemy.cooldown > .55 && Math.floor(this.time * 1.3) % 4 === 0;
      if (distance > 2.4) {
        const speed = enemy.kind === 'guardian' ? 2.05 : 2.7;
        this.move(enemy, Math.sin(enemy.yaw) * speed * dt, Math.cos(enemy.yaw) * speed * dt, .65);
      } else if (enemy.cooldown === 0) {
        enemy.attacks++; const shock = enemy.kind === 'gladiator' && enemy.attacks % 3 === 0;
        const windup = shock ? 1.1 : enemy.kind === 'guardian' ? .9 : .72;
        enemy.action = { type: shock ? 'shockwave' : 'strike', elapsed: 0, windup, duration: windup + .65, dealt: false }; enemy.guard = false;
        if (shock) this.ui.toast('EMBER RING', 'Varr charges a ground shockwave. Dodge through it or leave the ring.');
      }
    }
    enemy.actor.root.position.set(enemy.x, 0, enemy.z); enemy.actor.root.rotation.y = enemy.yaw;
    const a = enemy.action;
    enemy.actor.update(dt, { moving: !a && enemy.stagger === 0 && distance > 2.4 && distance < 20, attacking: !!a, attackProgress: a ? a.elapsed / a.duration : 0, heavy: true, blocking: enemy.guard, hit: enemy.hit > 0, time: this.time });
  }
  hurtPlayer(enemy, damage, area = false) {
    const p = this.player;
    const facing = area || inAttackArc(p, enemy, 7, 1.45);
    const resolved = resolveDefense({ damage, blocking: p.blocking && facing, stamina: p.stamina, defense: this.inventory.getStats().defense, perfect: p.blockTime < .24 && !area, dodging: p.action?.type === 'dodge' && p.action.elapsed < DODGE.invulnerableUntil });
    p.stamina = Math.max(0, p.stamina - resolved.staminaCost); p.regenDelay = .7;
    p.health = Math.max(0, p.health - resolved.damage);
    if (resolved.outcome === 'parried') { enemy.stagger = 1.2; enemy.action = null; enemy.cooldown = 1.4; this.audio.play('block'); this.burst(p.x, 1.3, p.z, '#a0f5e4', 16); this.ui.toast('PERFECT PARRY', 'Their guard is broken. Strike now.'); }
    else if (resolved.outcome === 'evaded') { this.ui.toast('EVADED', 'Timing over equipment.'); }
    else if (resolved.damage) { p.hit = .25; this.audio.play(resolved.outcome === 'blocked' ? 'block' : 'hit'); this.damageText(p.x, 2.2, p.z, `−${resolved.damage}`, '#ff8d75'); }
    if (p.health === 0) this.finish(false);
  }
  enterArena() {
    this.phase = 'intro'; this.introTimer = 3; this.player.health = 100; this.player.stamina = 100; this.player.mana = 100; this.player.action = null;
    this.player.z = 32; this.player.x = 0; this.gladiator.actor.setVisible(true); this.yaw = 0;
    this.ui.showIntro('VARR · THE GILDED OATH', 'Coliseum champion · His armor is earned. Your victory is not yet written.', 3000);
    this.audio.play('chest');
  }
  finish(won) {
    this.phase = won ? 'won' : 'lost'; this.keys.clear(); this.mouseBlock = false; this.player.action = null;
    this.ui.setPrompt(null); this.ui.setEnemy(null);
    this.ui.showResult({ won, title: won ? 'A LEGEND IS FORGED' : 'THE VAULT REMEMBERS', subtitle: won ? 'You defeated Varr. Knowledge armed you. Timing won the duel.' : 'Read the windup. Preserve stamina. A perfect parry creates an opening.', reward: won ? 'GILDED LAUREL · Expedition complete · Demonstration reward' : 'Return to the Vault and challenge fate again.' });
    if (won) this.audio.play('win');
  }
  updateCamera(dt, snap = false) {
    const p = this.player, target = new B.Vector3(p.x, 1.3, p.z);
    let desired = new B.Vector3(p.x - Math.sin(this.yaw) * this.zoom * Math.cos(this.pitch), 1.6 + Math.sin(this.pitch) * this.zoom, p.z - Math.cos(this.yaw) * this.zoom * Math.cos(this.pitch));
    const direction = desired.subtract(target), length = direction.length(); direction.normalize();
    const obstruction = this.scene.pickWithRay(new B.Ray(target, direction, length), mesh => mesh.name === 'merged-vault-architecture' && mesh.material?.alpha >= .95);
    if (obstruction?.hit && obstruction.distance < length) desired = target.add(direction.scale(Math.max(.35, obstruction.distance - .3)));
    this.camera.position = B.Vector3.Lerp(this.camera.position, desired, snap ? 1 : 1 - Math.exp(-10 * dt));
    this.camera.setTarget(target);
  }
  refreshHUD() {
    if (!this.player) return;
    const p = this.player, enemy = this.activeEnemy();
    this.ui.setHUD({ ...p, location: p.z > 27 ? 'THE COLISEUM' : Math.abs(p.x) > 11 ? (p.x < 0 ? 'THE KING’S KEEP · RELIC CHAMBER' : 'THE FRONTIER · RELIC CHAMBER') : 'THE VAULT · KINGDOM OF EARNINGS', objective: this.phase === 'arena' ? 'Defeat Varr. Watch for the Ember Ring.' : this.arenaUnlocked() ? 'Enter the northern passage to the Coliseum.' : `${this.guardian.dead ? 'Warden defeated' : 'Defeat the Auric Warden'} · Discover three research relics`, chests: this.opened.size, guardianDead: this.guardian.dead, arenaUnlocked: this.arenaUnlocked() });
    this.ui.setCombatState?.({ blocking: p.blocking, dodging: p.action?.type === 'dodge', heavy: p.action?.type === 'heavy', spellCooldown: p.spellCooldown });
    if (['explore', 'arena'].includes(this.phase) && !enemy.dead && dist(p, enemy) < 16) {
      this.ui.setEnemy({ name: enemy.name, health: enemy.health, maxHealth: enemy.maxHealth, intent: enemy.stagger > 0 ? 'STAGGERED · STRIKE NOW' : enemy.action ? (enemy.action.type === 'shockwave' ? 'EMBER RING · DODGE' : enemy.action.elapsed < enemy.action.windup ? 'WINDING UP · WATCH THE BLADE' : 'RECOVERING') : enemy.guard ? 'GUARDING · HEAVY STRIKE' : 'APPROACHING' });
    } else this.ui.setEnemy(null);
    let prompt = null;
    if (this.phase === 'explore' && !this.ui.isModalOpen()) {
      const chest = this.nearChest();
      if (chest) prompt = chest.id === 'earnings' && !this.guardian.dead ? 'Defeat the Warden to break this seal' : `E · Open the ${chest.id === 'management' ? 'King’s Keep' : chest.id === 'positioning' ? 'Frontier' : 'Vault'} chest`;
      else if (p.z > 19 && !this.arenaUnlocked()) prompt = 'Northern seal · Three relics and the Warden’s defeat required';
    }
    this.ui.setPrompt(prompt);
  }
  burst(x, y, z, color, count = 10) {
    const material = new B.StandardMaterial('spark-material', this.scene); material.emissiveColor = B.Color3.FromHexString(color); material.disableLighting = true;
    const reduced = settings.reducedMotion ? Math.min(4, count) : count;
    const group = { material, remaining: reduced };
    for (let i = 0; i < reduced; i++) {
      const mesh = B.MeshBuilder.CreateSphere('impact-spark', { diameter: .065, segments: 3 }, this.scene); mesh.position.set(x, y, z); mesh.material = material;
      const a = i * 2.399; this.effects.push({ mesh, group, life: .65, maxLife: .65, vx: Math.cos(a) * (1 + i % 3), vy: 1.3 + i % 4 * .4, vz: Math.sin(a) * (1 + i % 3) });
    }
  }
  revealLoot(item, position) {
    const root = new B.TransformNode('rising-research-relic', this.scene); root.position.set(position.x, 1.35, position.z);
    const material = new B.StandardMaterial('revealed-relic-gold', this.scene); material.diffuseColor = B.Color3.FromHexString(item.appearance.color); material.emissiveColor = material.diffuseColor.scale(.35); material.specularColor = B.Color3.White();
    const box = (name, width, height, depth, y) => { const mesh = B.MeshBuilder.CreateBox(name, { width, height, depth }, this.scene); mesh.parent = root; mesh.position.y = y; mesh.material = material; return mesh; };
    if (item.slot === 'weapon') {
      box('treasure-sword-blade', .17, 1.35, .07, .4).rotation.z = -.08; box('treasure-crossguard', .68, .1, .13, -.28); box('treasure-sword-grip', .13, .43, .13, -.52);
      const tip = B.MeshBuilder.CreateCylinder('treasure-sword-tip', { diameterTop: 0, diameterBottom: .22, height: .28, tessellation: 4 }, this.scene); tip.parent = root; tip.position.y = 1.19; tip.material = material;
    } else if (item.slot === 'shield') {
      const shield = B.MeshBuilder.CreateCylinder('treasure-aegis', { diameter: 1.15, height: .15, tessellation: 8 }, this.scene); shield.parent = root; shield.rotation.x = Math.PI / 2; shield.material = material;
      box('treasure-shield-glyph', .13, .75, .23, 0); box('treasure-shield-cross', .6, .13, .23, .15);
    } else {
      const star = B.MeshBuilder.CreatePolyhedron('treasure-frontier-star', { type: 1, size: .52 }, this.scene); star.parent = root; star.material = material;
    }
    this.effects.push({ mesh: root, material, life: 4.5, maxLife: 4.5, vx: 0, vy: settings.reducedMotion ? 0 : .2, vz: 0, loot: true });
  }
  damageText(x, y, z, text, color) {
    const texture = new B.DynamicTexture('damage-number', { width: 128, height: 64 }, this.scene, false); texture.hasAlpha = true;
    texture.drawText(text, null, 48, 'bold 42px Georgia', color, 'transparent', true);
    const material = new B.StandardMaterial('damage-label', this.scene); material.diffuseTexture = texture; material.opacityTexture = texture; material.emissiveColor = B.Color3.White(); material.disableLighting = true; material.backFaceCulling = false;
    const mesh = B.MeshBuilder.CreatePlane('combat-number', { width: 1.2, height: .6 }, this.scene); mesh.position.set(x, y, z); mesh.billboardMode = B.Mesh.BILLBOARDMODE_ALL; mesh.material = material;
    this.effects.push({ mesh, material, texture, life: .8, maxLife: .8, vx: 0, vy: .9, vz: 0 });
  }
  ring(x, z, color, size) {
    const mesh = B.MeshBuilder.CreateTorus('ember-shockwave', { diameter: size * 2, thickness: .13, tessellation: 48 }, this.scene); mesh.position.set(x, .14, z);
    const material = new B.StandardMaterial('ring-material', this.scene); material.emissiveColor = B.Color3.FromHexString(color); material.disableLighting = true; mesh.material = material;
    this.effects.push({ mesh, material, life: .65, maxLife: .65, vx: 0, vy: 0, vz: 0, ring: true });
  }
  updateEffects(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.life -= dt; p.mesh.position.x += p.dx * 17 * dt; p.mesh.position.z += p.dz * 17 * dt;
      if (!p.enemy.dead && Math.hypot(p.mesh.position.x - p.enemy.x, p.mesh.position.z - p.enemy.z) < 1) { this.hurtEnemy(p.enemy, p.damage, '#91f7e5'); p.enemy.stagger = .4; p.life = 0; }
      if (p.life <= 0 || !this.world.isWalkable(p.mesh.position.x, p.mesh.position.z, .05)) { p.mesh.dispose(); p.material.dispose(); this.projectiles.splice(i, 1); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.life -= dt;
      effect.mesh.position.x += effect.vx * dt; effect.mesh.position.y += effect.vy * dt; effect.mesh.position.z += effect.vz * dt;
      if (effect.group) effect.vy -= dt * 5;
      if (effect.ring) effect.mesh.scaling.scaleInPlace(1 + dt * .7);
      if (effect.loot && !settings.reducedMotion) effect.mesh.rotation.y += dt * .85;
      if (effect.material) effect.material.alpha = Math.max(0, effect.life / effect.maxLife);
      if (effect.life <= 0) {
        effect.mesh.dispose(); effect.texture?.dispose(); effect.material?.dispose();
        if (effect.group && --effect.group.remaining === 0) effect.group.material.dispose(); this.effects.splice(i, 1);
      }
    }
  }
  clearEffects() {
    for (const p of this.projectiles) { p.mesh.dispose(); p.material.dispose(); } this.projectiles = [];
    const groups = new Set(); for (const e of this.effects) { e.mesh.dispose(); e.material?.dispose(); e.texture?.dispose(); if (e.group) groups.add(e.group); } for (const group of groups) group.material.dispose(); this.effects = [];
  }
  installTestInterface() {
    window.__ORCA_TEST__ = Object.freeze({
      snapshot: () => ({ phase: this.phase, modal: this.ui.mode, player: { ...this.player }, camera: { yaw: this.yaw, pitch: this.pitch, position: this.camera.position.asArray() }, chests: [...this.opened], chestLids: Object.fromEntries(this.world.chests.map(c => [c.id, c.lid.rotation.x])), equipmentAppearance: { weapon: this.hero.weapon.getChildMeshes().find(m => m.material?.name === 'hero-equipped-blade')?.material.diffuseColor.toHexString(), shield: this.hero.shield.getChildMeshes().find(m => m.material?.name === 'hero-equipped-shield')?.material.diffuseColor.toHexString() }, equipped: { ...this.inventory.equipped }, items: this.inventory.list(), guardian: { health: this.guardian.health, dead: this.guardian.dead, x: this.guardian.x, z: this.guardian.z, action: this.guardian.action, guard: this.guardian.guard }, gladiator: { health: this.gladiator.health, dead: this.gladiator.dead, x: this.gladiator.x, z: this.gladiator.z, action: this.gladiator.action }, arenaUnlocked: this.arenaUnlocked(), meshes: this.scene.meshes.length, fps: this.engine.getFps(), effects: this.effects.length, projectiles: this.projectiles.length }),
      position: (x, z, yaw = 0) => { if (!this.world.isWalkable(x, z, .48)) throw new Error('Test position is outside collision geometry'); Object.assign(this.player, { x, z, yaw, vx: 0, vz: 0 }); this.yaw = yaw; this.updateCamera(1, true); },
      step: (seconds) => { for (let t = 0; t < seconds; t += 1 / 60) this.frame(1 / 60); },
      manualClock: () => this.engine.stopRenderLoop(),
      render: () => this.scene.render(),
      action: name => name === 'spell' ? this.cast() : name === 'dodge' ? this.dodge() : this.attack(name),
      collision: (x, z, radius = .48) => this.canWalk(x, z, radius),
      enemyHit: (damage = 23) => this.hurtPlayer(this.activeEnemy(), damage),
    });
  }
  fail(error) { console.error('ORCA Legends:', error); this.phase = 'error'; this.engine?.stopRenderLoop(); this.ui.showError?.(error.message); }
  dispose() { this.abort?.abort(); this.engine?.stopRenderLoop(); this.clearEffects(); this.audio.dispose(); this.ui.dispose(); this.world?.dispose(); this.scene?.dispose(); this.engine?.dispose(); delete window.__ORCA_TEST__; }
}

const game = new VaultGame();
game.checkAccess().catch(error => game.fail(error));
