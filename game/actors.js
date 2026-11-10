/* Original ORCA Legends character meshes and hierarchical animation rig.
 * No downloaded models, textures, character designs, or animation clips.
 */
const B = window.BABYLON;
const sides = [-1, 1];
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// Original additive poses: shoulder XYZ, elbow X, wrist XZ, torso YX,
// pelvis Y and local body Z. Contact is sampled at the simulation's hit time.
const restPose = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const lightPoses = [
  [-1.20, -.85, -.32, -.52, .06, -.28, -.28, -.04, -.10, -.035],
  [-1.02, .32, .21, -.12, -.28, .12, .21, .055, .07, .055],
  [-.35, .93, .34, -.12, -.10, .16, .32, .075, .13, .07],
];
const heavyPoses = [
  [-2.55, -.15, -.28, -.65, -.12, .06, -.14, -.15, -.04, -.065],
  [-1.05, .15, -.05, -.08, -.52, -.02, .14, .16, .06, .085],
  [.28, .25, .18, -.18, -.10, .02, .23, .22, .11, .10],
];

export function createFighter(scene, { kind = 'hero', name = kind } = {}) {
  const guardian = kind === 'guardian';
  const gladiator = kind === 'gladiator';
  const scale = guardian ? 1.39 : gladiator ? 1.15 : 1;
  const root = new B.TransformNode(`${kind}-root`, scene);
  root.scaling.setAll(scale);
  const rig = new B.TransformNode(`${kind}-rig`, scene);
  rig.parent = root;
  const ownedMaterials = [];
  const animatedMaterials = [];
  const meshes = [];
  let disposed = false;
  let stride = 0;
  let death = 0;
  let moveBlend = 0;
  let guardBlend = 0;
  const strikePose = new Float32Array(restPose.length);
  let currentWeaponId = null;
  let currentShieldId = null;

  function material(suffix, color, metal = .55, roughness = .48, emissive = null) {
    // A direct-light material keeps armor readable without fetching an IBL
    // environment. Narrow colored highlights describe the forged metal while
    // the diffuse response preserves the hero's silhouette in the dark vault.
    const mat = new B.StandardMaterial(`${kind}-${suffix}`, scene);
    mat.diffuseColor = B.Color3.FromHexString(color);
    mat.specularColor = new B.Color3(.42, .46, .49).scale(.12 + metal * .88);
    mat.specularPower = 12 + (1 - roughness) * 65;
    mat.maxSimultaneousLights = 4;
    mat.emissiveColor = emissive ? B.Color3.FromHexString(emissive) : mat.diffuseColor.scale(.025);
    ownedMaterials.push(mat);
    return mat;
  }
  const steel = material('tempered-plate', guardian ? '#343a42' : gladiator ? '#555964' : '#718b9a', .82, .34);
  const darkSteel = material('edge-steel', guardian ? '#181d25' : '#283846', .8, .45);
  const silver = material('blade-silver', '#c0d6db', .93, .24);
  const gold = material('engraved-brass', guardian ? '#c89a43' : '#ba9653', .84, .32);
  const leather = material('dark-leather', '#1b2025', .12, .9);
  const chain = material('chainmail', '#414e55', .7, .7);
  const cloth = material('cloth', guardian ? '#38302b' : gladiator ? '#74272d' : '#134c52', .03, .95);
  const clothLight = material('cloth-trim', gladiator ? '#b34f42' : '#2b7b7a', .1, .85);
  const eye = material('eyes', guardian ? '#ffc760' : gladiator ? '#ee7a4b' : '#65c9c6', .1, .3,
    guardian ? '#ff9d21' : gladiator ? '#d44519' : '#2b9292');
  const weaponMaterial = material('equipped-blade', '#b9ced5', .92, .23);
  const weaponInset = material('blade-inscription', '#9aacb0', .6, .35);
  const shieldMaterial = material('equipped-shield', '#4c6873', .76, .37);
  animatedMaterials.push(steel, darkSteel, gold, weaponMaterial, shieldMaterial);

  function node(label, parent, x = 0, y = 0, z = 0) {
    const n = new B.TransformNode(`${kind}-${label}`, scene);
    n.parent = parent;
    n.position.set(x, y, z);
    return n;
  }
  function finish(mesh, parent, mat, x, y, z) {
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    meshes.push(mesh);
    return mesh;
  }
  function box(label, parent, dimensions, mat, x = 0, y = 0, z = 0, bevel = 0) {
    // Faceted forms deliberately use different tapered armor surfaces instead
    // of smoothing the figure into a stack of featureless primitives.
    const m = B.MeshBuilder.CreateBox(`${kind}-${label}`, {
      width: dimensions[0], height: dimensions[1], depth: dimensions[2],
    }, scene);
    return finish(m, parent, mat, x, y, z);
  }
  function sphere(label, parent, diameter, mat, x = 0, y = 0, z = 0, squash = null) {
    const m = B.MeshBuilder.CreateSphere(`${kind}-${label}`, { diameter, segments: 6 }, scene);
    if (squash) m.scaling.set(...squash);
    return finish(m, parent, mat, x, y, z);
  }
  function cylinder(label, parent, height, top, bottom, mat, x = 0, y = 0, z = 0, tessellation = 8) {
    const m = B.MeshBuilder.CreateCylinder(`${kind}-${label}`, {
      height, diameterTop: top, diameterBottom: bottom, tessellation,
    }, scene);
    return finish(m, parent, mat, x, y, z);
  }
  function plate(label, parent, outline, depth, mat, x = 0, y = 0, z = 0) {
    // Convex outline in local XY. A raised center ridge makes light travel
    // across the forged surface as the character turns.
    const positions = [0, 0, depth * .65];
    for (const [px, py] of outline) positions.push(px, py, depth * .5);
    const backOffset = positions.length / 3;
    for (const [px, py] of outline) positions.push(px, py, -depth * .5);
    positions.push(0, 0, -depth * .5);
    const backCenter = positions.length / 3 - 1;
    const indices = [];
    for (let i = 0; i < outline.length; i++) {
      const a = 1 + i, b = 1 + (i + 1) % outline.length;
      const c = backOffset + i, d = backOffset + (i + 1) % outline.length;
      indices.push(0, a, b, backCenter, d, c, a, c, d, a, d, b);
    }
    const normals = [];
    B.VertexData.ComputeNormals(positions, indices, normals);
    const data = new B.VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    const m = new B.Mesh(`${kind}-${label}`, scene);
    data.applyToMesh(m);
    m.convertToFlatShadedMesh();
    return finish(m, parent, mat, x, y, z);
  }

  const pelvis = node('pelvis', rig, 0, .92, 0);
  sphere('hip-chain', pelvis, .46, chain, 0, 0, 0, [1, .64, .78]);
  box('belt', pelvis, [.47, .10, .31], leather, 0, .08, 0);
  box('belt-gold-edge', pelvis, [.49, .023, .33], gold, 0, .12, 0);
  plate('belt-buckle', pelvis, [[-.06, -.05], [.06, -.05], [.075, .025], [0, .07], [-.075, .025]], .045, gold, 0, .075, .18);
  const torso = node('torso', pelvis, 0, .18, 0);
  cylinder('cuirass', torso, .43, .60, .40, steel, 0, .24, 0);
  const breast = plate('breastplate', torso, [[-.23, -.16], [.23, -.16], [.30, .13], [.16, .23], [-.16, .23], [-.30, .13]], .10, steel, 0, .25, .17);
  plate('chest-gold-mark', torso, [[-.025, -.13], [.025, -.13], [.045, .10], [0, .17], [-.045, .10]], .018, gold, 0, .26, .245);
  for (let i = 0; i < 3; i++) {
    box(`abdomen-lame-${i}`, torso, [.38 + i * .025, .045, .055], darkSteel, 0, .035 + i * .055, .18);
  }
  cylinder('gorget', torso, .10, .29, .37, gold, 0, .51, 0);
  // Hanging split tabard, shortened to leave the animated legs visible.
  const tabard = plate('front-tabard', pelvis,
    [[-.14, .01], [.14, .01], [.12, -.43], [0, -.49], [-.12, -.43]], .02, cloth, 0, -.02, .185);
  plate('tabard-glyph', tabard, [[-.012, .11], [.012, .11], [.022, -.10], [0, -.16], [-.022, -.10]], .012, gold, 0, -.13, .02);
  for (const side of [-1, 1]) {
    const tasset = plate(`tasset-${side}`, pelvis, [[-.12, .10], [.12, .10], [.105, -.18], [0, -.23], [-.105, -.18]], .065, steel,
      side * .225, -.075, .075);
    tasset.rotation.z = side * .18;
  }

  const head = node('head', torso, 0, .62, 0);
  cylinder('helm', head, .29, .28, .33, steel, 0, .02, 0, 8);
  sphere('helm-crown', head, .32, steel, 0, .16, -.005, [1, .45, 1]);
  const faceplate = plate('visor', head,
    [[-.145, .12], [.145, .12], [.12, -.11], [0, -.16], [-.12, -.11]], .07, darkSteel, 0, 0, .139);
  box('brow', head, [.31, .027, .04], gold, 0, .08, .193);
  box('eye-slit', head, [guardian ? .08 : .235, .018, .015], eye, guardian ? .045 : 0, .045, .188);
  if (!guardian) box('visor-ridge', head, [.022, .21, .027], steel, 0, -.025, .199);
  for (const side of [-1, 1]) {
    box(`helmet-cheek-${side}`, head, [.035, .17, .055], steel, side * .13, -.055, .145);
    sphere(`temple-pin-${side}`, head, .042, gold, side * .158, .025, .025);
  }
  if (gladiator) {
    const crest = plate('crimson-crest', head,
      [[-.11, 0], [.11, 0], [.15, .20], [.08, .34], [0, .39], [-.08, .34], [-.15, .20]], .07, cloth, 0, .20, -.045);
    crest.rotation.y = Math.PI / 2;
    for (const side of [-1, 1]) {
      const horn = cylinder(`helm-horn-${side}`, head, .22, 0, .085, gold, side * .21, .14, 0);
      horn.rotation.z = -side * .65;
    }
  } else if (guardian) {
    for (const side of [-1, 1]) {
      const horn = cylinder(`crown-prong-${side}`, head, .18, .018, .08, gold, side * .13, .23, -.01);
      horn.rotation.z = -side * .28;
    }
    cylinder('crown-prong-center', head, .20, 0, .065, gold, 0, .25, -.10);
  } else {
    box('helm-comb', head, [.034, .055, .29], gold, 0, .18, -.01);
  }

  const cape = node('cape', torso, 0, .43, -.19);
  const capeMesh = plate('cape-cloth', cape,
    [[-.24, 0], [.24, 0], [.31, -.88], [.15, -.96], [0, -.92], [-.16, -.98], [-.31, -.88]], .022, cloth, 0, -.04, -.035);
  capeMesh.rotation.x = .10;
  for (const side of [-1, 1]) {
    const binding = box(`cape-binding-${side}`, cape, [.016, .88, .022], gold, side * .255, -.44, -.04);
    binding.rotation.z = side * .075;
    sphere(`cape-clasp-${side}`, torso, .07, gold, side * .21, .45, .17, [1, 1, .5]);
  }
  const arms = {};
  for (const side of [-1, 1]) {
    const shoulder = node(`shoulder-${side}`, torso, side * .34, .40, 0);
    sphere(`pauldron-${side}`, shoulder, .34, steel, side * .025, .0, 0, [1.08, .68, 1.02]);
    const pauldronRim = cylinder(`pauldron-rim-${side}`, shoulder, .035, .34, .34, gold, side * .025, -.07, 0);
    for (let i = 0; i < 2; i++) {
      const lame = box(`shoulder-lame-${side}-${i}`, shoulder, [.25, .05, .25], darkSteel, side * .025, -.11 - i * .045, .005);
      lame.rotation.z = side * -.15;
    }
    cylinder(`upper-arm-${side}`, shoulder, .25, .17, .15, chain, 0, -.20, 0);
    const elbow = node(`elbow-${side}`, shoulder, 0, -.32, 0);
    sphere(`elbow-guard-${side}`, elbow, .19, steel, 0, 0, .018, [1, 1, .8]);
    cylinder(`bracer-${side}`, elbow, .24, .17, .13, steel, 0, -.135, .012);
    cylinder(`wrist-trim-${side}`, elbow, .035, .14, .14, gold, 0, -.25, .012);
    const hand = node(`hand-${side}`, elbow, 0, -.295, .015);
    sphere(`gauntlet-${side}`, hand, .145, darkSteel, 0, 0, 0, [.82, 1.02, 1.05]);
    arms[side] = { shoulder, elbow, hand };
    if (guardian || gladiator) {
      const spike = cylinder(`shoulder-spike-${side}`, shoulder, guardian ? .17 : .11, 0, .09, gold,
        side * .055, .12, 0);
      spike.rotation.z = -side * .35;
    }
  }

  const legs = {};
  for (const side of [-1, 1]) {
    const hip = node(`hip-${side}`, pelvis, side * .13, -.08, 0);
    cylinder(`thigh-${side}`, hip, .34, .22, .19, chain, 0, -.20, 0);
    plate(`thigh-plate-${side}`, hip,
      [[-.10, .13], [.10, .13], [.08, -.16], [-.08, -.16]], .055, steel, 0, -.20, .10);
    const knee = node(`knee-${side}`, hip, 0, -.40, 0);
    sphere(`knee-guard-${side}`, knee, .22, steel, 0, 0, .035, [1, .87, 1]);
    sphere(`knee-rivet-${side}`, knee, .04, gold, 0, 0, .148);
    cylinder(`greave-${side}`, knee, .29, .18, .12, steel, 0, -.18, 0);
    box(`greave-ridge-${side}`, knee, [.028, .25, .035], gold, 0, -.18, .091);
    const foot = box(`sabatons-${side}`, knee, [.18, .13, .31], darkSteel, 0, -.365, .062);
    for (let i = 0; i < 3; i++) box(`foot-lame-${side}-${i}`, knee,
      [.175, .018, .057], steel, 0, -.301 - i * .004, .025 + i * .065);
    legs[side] = { hip, knee, foot };
  }

  // Blade is a tapered, double-edged, ridged forged mesh. Its tip starts at
  // the guard and extends along local Y, allowing the whole weapon to pivot.
  const weapon = node('weapon', arms[-1].hand, 0, -.01, .025);
  weapon.rotation.x = 2.64;
  weapon.rotation.z = -.10;
  const blade = plate('sword-blade', weapon,
    [[-.055, .09], [.055, .09], [.047, .79], [0, .98], [-.047, .79]], .045,
    weaponMaterial, 0, 0, 0);
  const fuller = box('blade-fuller', weapon, [.014, .57, .012], weaponInset, 0, .41, .033);
  box('crossguard', weapon, [guardian ? .34 : .27, .05, .07], gold, 0, .07, 0);
  for (const side of [-1, 1]) {
    const quillon = box(`guard-tip-${side}`, weapon, [.045, .11, .055], gold, side * (guardian ? .15 : .12), .09, 0);
    quillon.rotation.z = side * -.45;
  }
  cylinder('sword-grip', weapon, .19, .055, .06, leather, 0, -.06, 0);
  for (let i = 0; i < 4; i++) cylinder(`grip-binding-${i}`, weapon, .009, .063, .063, gold, 0, -.13 + i * .04, 0);
  sphere('sword-pommel', weapon, .085, gold, 0, -.18, 0);
  if (guardian) {
    blade.scaling.x = 1.9;
    blade.scaling.y = 1.2;
    fuller.scaling.y = 1.2;
  } else if (gladiator) {
    blade.scaling.y = 1.12;
    blade.scaling.x = 1.25;
  }

  const shield = node('shield', arms[1].elbow, .035, -.12, .17);
  shield.rotation.y = .08;
  const shieldOutline = [[-.23, .30], [.23, .30], [.25, .07], [.15, -.25], [0, -.37], [-.15, -.25], [-.25, .07]];
  const shieldOuter = plate('shield-rim', shield, shieldOutline, .075, gold, 0, 0, 0);
  const shieldFace = plate('shield-face', shield, shieldOutline.map(([x, y]) => [x * .88, y * .88]), .065, shieldMaterial, 0, 0, .035);
  plate('shield-sigil', shield, [[-.022, .18], [.022, .18], [.045, .025], [.10, -.04], [.04, -.075], [0, -.20], [-.04, -.075], [-.10, -.04], [-.045, .025]],
    .022, gold, 0, 0, .10);
  sphere('shield-boss', shield, .09, silver, 0, .025, .118, [1, 1, .42]);
  for (const [x, y] of [[-.18, .22], [.18, .22], [-.16, -.10], [.16, -.10], [0, -.27]]) {
    sphere(`shield-rivet-${x}-${y}`, shield, .025, silver, x, y, .079);
  }
  if (guardian) shield.scaling.set(1.12, 1.12, 1);
  if (gladiator) shield.scaling.set(.82, .9, 1);
  const spellOrb = sphere('spell-focus', arms[1].hand, .065, eye, 0, .005, .095);

  function equip({ weapon: weaponItem, shield: shieldItem, spell: spellItem } = {}) {
    if (weaponItem && weaponItem.id !== currentWeaponId) {
      currentWeaponId = weaponItem.id;
      const color = weaponItem.appearance?.color || '#c4d7df';
      weaponMaterial.diffuseColor = B.Color3.FromHexString(color);
      const special = !['common', 'COMMON'].includes(weaponItem.rarity);
      weaponMaterial.emissiveColor = special ? B.Color3.FromHexString(color).scale(.14) : B.Color3.Black();
      blade.scaling.y = special ? 1.12 : 1;
      blade.scaling.x = special ? 1.23 : 1;
      weaponInset.emissiveColor = special ? B.Color3.FromHexString(color).scale(.6) : B.Color3.Black();
      weaponInset.diffuseColor = B.Color3.FromHexString(special ? '#fff1bb' : '#718791');
      fuller.scaling.y = special ? 1.15 : 1;
    }
    if (shieldItem && shieldItem.id !== currentShieldId) {
      currentShieldId = shieldItem.id;
      const color = shieldItem.appearance?.color || '#4c6873';
      shieldMaterial.diffuseColor = B.Color3.FromHexString(color);
      const special = !['common', 'COMMON'].includes(shieldItem.rarity);
      shieldMaterial.emissiveColor = special ? B.Color3.FromHexString(color).scale(.06) : B.Color3.Black();
      shield.scaling.set(special ? 1.1 : 1, special ? 1.1 : 1, 1);
    }
    if (spellItem?.appearance?.color) eye.emissiveColor = B.Color3.FromHexString(spellItem.appearance.color).scale(.65);
  }

  function update(dt, state = {}) {
    if (disposed) return;
    const time = state.time || 0;
    const moving = !!state.moving;
    const sprinting = !!state.sprinting;
    const attacking = !!state.attacking;
    const blocking = !!state.blocking;
    const dodging = !!state.dodging;
    const dead = !!state.dead;
    const victory = !!state.victory;
    const attack = Math.max(0, Math.min(1, state.attackProgress || 0));
    const heavy = !!state.heavy;
    const reducedMotion = !!state.reducedMotion;
    const transition = 1 - Math.exp(-12 * dt);
    moveBlend += ((moving && !dead ? 1 : 0) - moveBlend) * transition;
    guardBlend += ((blocking && !dead && !dodging && !attacking ? 1 : 0) - guardBlend) * (1 - Math.exp(-22 * dt));
    // The blade reaches the authored contact pose at the actual damage tick.
    // The longer heavy anticipation therefore never moves the hit window.
    strikePose.fill(0);
    if (attacking && !dead) {
      const impact = Math.max(.2, Math.min(.8, state.attackImpact || (heavy ? .48 / .94 : .22 / .56)));
      const windEnd = impact - (heavy ? .14 : .13);
      const followEnd = Math.min(.9, impact + (heavy ? .13 : .15));
      const poses = heavy ? heavyPoses : lightPoses;
      let from, to, weight;
      if (attack < windEnd) { from = restPose; to = poses[0]; weight = smooth(attack / windEnd); }
      else if (attack < impact) { from = poses[0]; to = poses[1]; weight = smooth((attack - windEnd) / (impact - windEnd)); }
      else if (attack < followEnd) { from = poses[1]; to = poses[2]; weight = smooth((attack - impact) / (followEnd - impact)); }
      else { from = poses[2]; to = restPose; weight = smooth((attack - followEnd) / (1 - followEnd)); }
      for (let i = 0; i < strikePose.length; i++) strikePose[i] = from[i] + (to[i] - from[i]) * weight;
    }
    stride += dt * (moving ? (sprinting ? 13.8 : 9) : 1.2);
    death = B.Scalar.Lerp(death, dead ? 1 : 0, Math.min(1, dt * 5));
    const attackWeight = attacking ? smooth(attack / .12) * smooth((1 - attack) / .18) : 0;
    const gait = !dodging && !dead ? moveBlend * (sprinting ? .66 : .43) * (1 - attackWeight) : 0;
    const bob = !dodging ? Math.abs(Math.sin(stride)) * (sprinting ? .05 : .026) * moveBlend + Math.sin(time * 1.6) * .009 * (1 - moveBlend) : 0;
    rig.position.y = bob - (dodging ? .35 : 0) - death * .20;
    rig.rotation.x = dodging ? -.65 : sprinting && moving ? -.13 : 0;
    rig.rotation.z = death * -1.48;
    rig.position.x = death * -.17;
    rig.position.z = strikePose[9];
    pelvis.rotation.y = Math.sin(stride) * .045 * moveBlend * (1 - attackWeight) + strikePose[8];
    torso.rotation.y = -Math.sin(stride) * .04 * moveBlend * (1 - attackWeight) + strikePose[6];
    torso.rotation.x = (dodging ? .7 : -.10 * guardBlend) + strikePose[7];
    head.rotation.x = dead ? .24 : -.06 * guardBlend + Math.sin(time * .8) * .018 * (1 - guardBlend);
    cape.rotation.x = .12 + (sprinting && moving ? .40 : moving ? .16 : 0) + Math.sin(time * 3) * .025;
    cape.rotation.z = Math.sin(time * 2.3) * .035;
    tabard.rotation.x = moving ? .08 + Math.abs(Math.sin(stride)) * .12 : .01;
    for (const side of sides) {
      const phase = stride + (side === -1 ? Math.PI : 0);
      legs[side].hip.rotation.x = Math.sin(phase) * gait;
      legs[side].knee.rotation.x = Math.max(0, -Math.sin(phase)) * gait * 1.3;
      if (dodging) {
        legs[side].hip.rotation.x = side * .8;
        legs[side].knee.rotation.x = 1.1;
      }
      arms[side].shoulder.rotation.set(Math.sin(phase + Math.PI) * gait * .65, 0, side * -.09);
      arms[side].elbow.rotation.x = moving ? -.12 : -.06;
    }
    arms[-1].shoulder.rotation.x += strikePose[0];
    arms[-1].shoulder.rotation.y += strikePose[1];
    arms[-1].shoulder.rotation.z += strikePose[2];
    arms[-1].elbow.rotation.x += strikePose[3];
    weapon.rotation.x = 2.64 + strikePose[4];
    weapon.rotation.z = -.10 + strikePose[5];
    arms[1].shoulder.rotation.x += (-.85 - arms[1].shoulder.rotation.x) * guardBlend;
    arms[1].shoulder.rotation.y = -.30 * guardBlend;
    arms[1].shoulder.rotation.z += (-.22 - arms[1].shoulder.rotation.z) * guardBlend;
    arms[1].elbow.rotation.x += (-.32 - arms[1].elbow.rotation.x) * guardBlend;
    shield.rotation.x = .4 * guardBlend;
    shield.rotation.y = .08 - .35 * guardBlend;
    // Flinch only the visual rig. Physics, facing and committed enemy windups
    // remain authoritative; a light hit cannot manufacture a stagger.
    const reaction = state.reaction;
    if (reaction?.remaining > 0 && reaction.duration > 0 && !dead) {
      const remaining = Math.max(0, Math.min(1, reaction.remaining / reaction.duration));
      const recoil = remaining * remaining * Math.max(0, Math.min(1.8, reaction.strength ?? 1)) * (reducedMotion ? .3 : 1);
      const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y);
      const localX = c * reaction.x - s * reaction.z, localZ = s * reaction.x + c * reaction.z;
      rig.position.x += localX * .08 * recoil;
      rig.position.z += localZ * .08 * recoil;
      rig.rotation.x += localZ * .16 * recoil;
      rig.rotation.z -= localX * .14 * recoil;
      torso.rotation.y += localX * .12 * recoil;
      head.rotation.x -= localZ * .10 * recoil;
      if (reaction.kind === 'blocked' || reaction.kind === 'parried') shield.rotation.x -= .16 * recoil;
    }
    if (victory && !dead) {
      arms[-1].shoulder.rotation.x = -2.7 + Math.sin(time * 3) * .07;
      arms[-1].shoulder.rotation.z = -.25;
      arms[-1].elbow.rotation.x = -.5;
      head.rotation.x = -.10;
    }
    if (dead) {
      arms[-1].shoulder.rotation.z = -.55;
      arms[1].shoulder.rotation.z = .42;
      legs[-1].hip.rotation.x = -.1;
      legs[1].hip.rotation.x = .1;
    }
    const hit = Math.max(0, Math.min(1, typeof state.hit === 'number' ? state.hit : state.hit ? 1 : 0));
    const flash = hit * (reducedMotion ? .45 : 1);
    steel.emissiveColor.set(steel.diffuseColor.r * .025 + .45 * flash, steel.diffuseColor.g * .025 + .08 * flash, steel.diffuseColor.b * .025 + .025 * flash);
    spellOrb.scaling.setAll(1 + Math.sin(time * 4) * .12);
  }

  return {
    root, weapon, shield, name,
    update, equip,
    setVisible(visible) { root.setEnabled(!!visible); },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.dispose(false);
      for (const mat of ownedMaterials) mat.dispose();
    },
  };
}
