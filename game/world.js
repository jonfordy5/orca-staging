/* Original ORCA Legends geometry and hand-authored procedural textures. No remote assets. */
const B = window.BABYLON;
export function createWorld(scene, options = {}) {
  const root = new B.TransformNode('vault-world', scene);
  const staticMeshes = [], obstacles = [], animated = [], textures = [], materials = [];
  let seed = 7291;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hex = c => B.Color3.FromHexString(c);
  function mat(name, color, emissive = null, alpha = 1) {
    const m = new B.StandardMaterial(name, scene); m.diffuseColor = hex(color);
    m.specularColor = hex('#3b3429'); m.specularPower = 44; m.alpha = alpha; m.maxSimultaneousLights = 4;
    if (emissive) m.emissiveColor = hex(emissive);
    materials.push(m); return m;
  }
  const stone = mat('aged-charcoal-limestone', '#c2bcae');
  const trim = mat('carved-sandstone', '#a49270');
  const dark = mat('deep-obsidian-insets', '#181b20');
  const gold = mat('antique-gilded-bronze', '#927648'); gold.specularColor = hex('#8b7549'); gold.specularPower = 72;
  const brightGold = mat('treasury-gold', '#d3a649'); brightGold.specularColor = hex('#b69c62');
  const wood = mat('ancient-chest-oak', '#39291b');
  const cloth = mat('burgundy-woven-banners', '#561e23'); cloth.backFaceCulling = false;
  const blueCloth = mat('arena-indigo-banners', '#212738'); blueCloth.backFaceCulling = false;
  const fireMat = mat('golden-fire', '#fff1b4', '#ffa735');
  const blueFire = mat('azure-magic', '#a6ecff', '#66bfdc');
  const violetFire = mat('amethyst-magic', '#c5abff', '#8464b4');
  const sunMat = mat('sunlit-oculus', '#fff4c9', '#ffda80');
  function texture(name, draw, size = 512) {
    const t = new B.DynamicTexture(name, {width:size,height:size}, scene, false); draw(t.getContext(), size); t.update(false); textures.push(t); return t;
  }
  const wallTex = texture('original-block-masonry', (c,s) => {
    c.fillStyle = '#726b59'; c.fillRect(0,0,s,s);
    const row = s/4, col = s/3;
    for (let y=-1;y<5;y++) for(let x=-1;x<4;x++) {
      const a = 77 + Math.floor(rand()*32); c.fillStyle=`rgb(${a+10},${a+5},${a-4})`;
      const px=x*col+(y%2)*col/2, py=y*row;
      c.fillRect(px+3,py+3,col-6,row-6);
      c.strokeStyle='rgba(226,210,166,.09)'; c.strokeRect(px+5,py+5,col-10,row-10);
      for(let i=0;i<90;i++){c.fillStyle=rand()>.5?'rgba(0,0,0,.065)':'rgba(255,245,209,.04)'; c.fillRect(px+rand()*col,py+rand()*row,1+rand()*15,1+rand()*2);}
      if(rand()>.5){c.strokeStyle='rgba(25,25,20,.25)'; c.beginPath(); const cx=px+rand()*col; c.moveTo(cx,py+4); c.lineTo(cx+rand()*12,py+row*.3); c.lineTo(cx-4,py+row*.5); c.stroke();}
    }
  }); wallTex.uScale=2; wallTex.vScale=2; wallTex.wrapU=B.Texture.WRAP_ADDRESSMODE; wallTex.wrapV=B.Texture.WRAP_ADDRESSMODE; stone.diffuseTexture=wallTex;
  const floorMat = mat('polished-vault-flagstones', '#e8e1d2');
  floorMat.specularColor=hex('#494339'); floorMat.specularPower=82;
  floorMat.emissiveColor=new B.Color3(.16,.15,.13);floorMat.linkEmissiveWithDiffuse=true;
  floorMat.diffuseTexture=texture('original-floor-stone', (c,s)=>{
    c.fillStyle='#26282a'; c.fillRect(0,0,s,s);
    for(let y=0;y<4;y++)for(let x=0;x<4;x++){
      const a=111+Math.floor(rand()*34);c.fillStyle=`rgb(${a+6},${a+4},${a})`;c.fillRect(x*128+2,y*128+2,124,124);
      c.strokeStyle='rgba(190,174,130,.17)';c.strokeRect(x*128+3,y*128+3,122,122);
      for(let i=0;i<60;i++){c.strokeStyle=`rgba(165,158,140,${rand()*.12})`;c.beginPath(); const px=x*128+rand()*124,py=y*128+rand()*124;c.moveTo(px,py);c.lineTo(px+rand()*80,py+rand()*20);c.stroke();}
    }
  }); floorMat.diffuseTexture.uScale=5; floorMat.diffuseTexture.vScale=8;
  // DynamicTexture defaults to CLAMP; tiled UVs must explicitly repeat or most
  // of the floor samples only the dark outer grout pixel.
  floorMat.diffuseTexture.wrapU=B.Texture.WRAP_ADDRESSMODE;floorMat.diffuseTexture.wrapV=B.Texture.WRAP_ADDRESSMODE;
  floorMat.bumpTexture=texture('original-floor-normal',(c,s)=>{
    c.fillStyle='rgb(128,128,255)';c.fillRect(0,0,s,s);
    for(let y=0;y<4;y++)for(let x=0;x<4;x++){
      c.fillStyle='rgb(80,128,242)';c.fillRect(x*128,y*128,3,128);
      c.fillStyle='rgb(176,128,242)';c.fillRect(x*128+125,y*128,3,128);
      c.fillStyle='rgb(128,80,242)';c.fillRect(x*128,y*128,128,3);
      c.fillStyle='rgb(128,176,242)';c.fillRect(x*128,y*128+125,128,3);
    }
  });floorMat.bumpTexture.uScale=5;floorMat.bumpTexture.vScale=8;floorMat.bumpTexture.wrapU=B.Texture.WRAP_ADDRESSMODE;floorMat.bumpTexture.wrapV=B.Texture.WRAP_ADDRESSMODE;floorMat.bumpTexture.level=.24;
  const bannerMat=cloth;
  function box(name,w,h,d,x,y,z,material=stone,parent=root,isStatic=true) {
    const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.material=material;m.parent=parent;
    if(isStatic)staticMeshes.push(m);return m;
  }
  function cylinder(name,diameter,height,x,y,z,material=stone,parent=root,tessellation=16,isStatic=true,diameterTop=diameter) {
    const m=B.MeshBuilder.CreateCylinder(name,{diameterBottom:diameter,diameterTop,height,tessellation},scene);m.position.set(x,y,z);m.material=material;m.parent=parent;if(isStatic)staticMeshes.push(m);return m;
  }
  function sphere(name,diameter,x,y,z,material,parent=root,isStatic=true,segments=8) {
    const m=B.MeshBuilder.CreateSphere(name,{diameter,segments},scene);m.position.set(x,y,z);m.material=material;m.parent=parent;if(isStatic)staticMeshes.push(m);return m;
  }
  function torus(name,diameter,thickness,x,y,z,material=gold,parent=root,isStatic=true) {
    const m=B.MeshBuilder.CreateTorus(name,{diameter,thickness,tessellation:36},scene);m.position.set(x,y,z);m.material=material;m.parent=parent;if(isStatic)staticMeshes.push(m);return m;
  }
  function lineTube(name,points,radius,material,parent=root,isStatic=true) {
    const m=B.MeshBuilder.CreateTube(name,{path:points,radius,tessellation:6,cap:B.Mesh.CAP_ALL},scene);m.material=material;m.parent=parent;if(isStatic)staticMeshes.push(m);return m;
  }
  function floor(x,z,w,d) { const f=B.MeshBuilder.CreateGround('mosaic-stone-floor',{width:w,height:d},scene);f.position.set(x,0,z);f.material=floorMat;f.parent=root;staticMeshes.push(f); }
  floor(0,0,22,36); floor(-17,2,12,14);floor(17,2,12,14);floor(0,22.5,8,9);floor(0,41,30,28);
  // Raised seams and gold channels trace the circulation through the treasury.
  for(const x of [-4.6,4.6])box('floor-brass-inlay',.045,.012,34,x,.015,0,gold);
  for(const z of [-12,-6,0,6,12])box('cross-floor-inlay',9.2,.012,.045,0,.016,z,gold);
  // The player-facing wall remains low for the over-the-shoulder camera.
  box('entrance-foundation',22,1.25,.8,0,.625,-18.4);
  for(const x of [-11.4,11.4]){
    box('long-wall-south',.8,8,13,x,4,-11.5);
    box('long-wall-north',.8,8,9,x,4,13.5);
    box('side-door-lintel',.8,2.8,14,x,7.2,2);
  }
  box('north-wall-west',7,8,.8,-7.5,4,18.4);
  box('north-wall-east',7,8,.8,7.5,4,18.4);
  box('north-arch-spandrel',8,1.3,.8,0,8.0,18.4);
  // West and east reliquary rooms.
  for(const x of [-23.4,23.4])box('reliquary-end-wall',.8,7.7,14.8,x,3.85,2);
  for(const x of [-17,17]) for(const z of [-5.4,9.4])box('reliquary-side-wall',12.8,7.7,.8,x,3.85,z);
  for(const x of [-4.4,4.4])box('coliseum-processional-wall',.8,6.5,9,x,3.25,22.5);
  // Layered bases, capitals and clustered shafts produce a recognizable Gothic arcade.
  function pillar(x,z,height=7.1,block=true){
    box('pillar-plinth',1.5,.28,1.5,x,.14,z,trim);
    box('pillar-stepped-base',1.24,.25,1.24,x,.4,z,gold);
    cylinder('octagonal-pillar-base',1.15,.52,x,.76,z,trim,root,8);
    cylinder('faceted-stone-column',.81,height-1.6,x,(height-1.6)/2+1,z,stone,root,12);
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])cylinder('engaged-pillar-shaft',.22,height-1.9,x+Math.cos(a)*.43,(height-1.9)/2+1.05,z+Math.sin(a)*.43,trim,root,8);
    for(const y of [1.0,height-.7,height-.3])cylinder('gilded-column-ring',1.12,.12,x,y,z,gold,root,12);
    cylinder('carved-pillar-capital',1.26,.38,x,height-.45,z,trim,root,8,true,.94);
    box('capital-abacus',1.46,.2,1.46,x,height-.11,z,gold);
    if(block)obstacles.push({x,z,r:.74});
  }
  for(const x of [-7.7,7.7])for(const z of [-12,-4,4,12])pillar(x,z);
  // Pointed double-curved arch ribs use many contiguous carved wedge stones.
  function arch(cx,z,halfWidth=7.7,spring=7.1,rise=3.7,material=trim,orientation=0){
    for(let side=-1;side<=1;side+=2){
      const pts=[];for(let i=0;i<=24;i++){
        const t=i/24; const localX=side*halfWidth*(1-t),y=spring+rise*Math.sin(t*Math.PI/2);
        pts.push(new B.Vector3(cx+localX*Math.cos(orientation),y,z+localX*Math.sin(orientation)));
      }
      lineTube('pointed-vault-rib',pts,.19,material);
      for(let i=0;i<12;i++){
        const t=(i+.5)/12,lx=side*halfWidth*(1-t),y=spring+rise*Math.sin(t*Math.PI/2);
        const wedge=box('arch-voussoir',.7,.34,.56,cx+lx*Math.cos(orientation),y,z+lx*Math.sin(orientation),i%3===0?gold:trim);
        wedge.rotation.z=side*-Math.atan(rise*Math.PI*.5*Math.cos(t*Math.PI/2)/halfWidth);
        wedge.rotation.y=-orientation;
      }
    }
    sphere('rib-keystone',.6,cx,spring+rise,z,gold);
  }
  for(const z of [-12,-4,4,12])arch(0,z);
  for(const x of [-7.7,7.7])for(const z of [-8,0,8])arch(x,z,4,7.1,2.9,stone,Math.PI/2);
  // High barrel vault closes the darkness above the arcade. The oculus remains open.
  for(const side of [-1,1]) {
    const paths=[];for(const z of [-18,18]){const points=[];for(let i=0;i<=14;i++){const x=side*(2.8+i*(8.2/14));const y=7.8+3.3*Math.pow(1-Math.abs(x)/11,.55);points.push(new B.Vector3(x,y,z));}paths.push(points);}
    const vault=B.MeshBuilder.CreateRibbon('continuous-vaulted-stone-ceiling',{pathArray:paths,sideOrientation:B.Mesh.DOUBLESIDE},scene);vault.material=stone;vault.parent=root;staticMeshes.push(vault);
  }
  // Narrow roofing at the edges keeps the central oculus open.
  for(const x of [-9.75,9.75])box('outer-roof-vault',2.6,.4,36,x,9.9,0,stone);
  for(const z of [-18,18])box('end-roof-trim',22,.35,1,z===-18?0:0,10.1,z,stone);
  // Arcaded niches, gilded trophies and original sentinel statues.
  function statue(x,z,rot=0){
    const n=new B.TransformNode('stone-sentinel-statue',scene);n.position.set(x,0,z);n.rotation.y=rot;n.parent=root;
    cylinder('statue-pedestal',2.0,.42,0,.21,0,trim,n,8);
    cylinder('pedestal-gilding',1.8,.08,0,.46,0,gold,n,8);
    cylinder('sentinel-skirt',1.05,1.1,0,1.2,0,stone,n,8,true,.6);
    box('sentinel-cuirass',.9,.98,.58,0,2.17,0,trim,n);
    sphere('sentinel-pauldron',.51,-.57,2.48,0,gold,n);sphere('sentinel-pauldron',.51,.57,2.48,0,gold,n);
    sphere('sentinel-helm',.65,0,3.0,0,stone,n);
    box('statue-face-slit',.4,.08,.1,0,3.04,-.31,dark,n);
    for(const sx of [-.55,.55]){const arm=box('statue-arm',.28,.94,.3,sx,2.0,-.06,stone,n);arm.rotation.z=sx*.35;}
    box('sentinel-sword',.13,2.2,.09,0,1.5,-.53,gold,n);
    box('sentinel-crossguard',.74,.1,.13,0,2.4,-.53,gold,n);
    obstacles.push({x,z,r:1.0});
  }
  statue(-9.6,-8,-Math.PI/2);statue(9.6,-8,Math.PI/2);statue(-9.6,8,-Math.PI/2);statue(9.6,8,Math.PI/2);
  function banner(x,z,rotation=0,material=bannerMat){
    const n=new B.TransformNode('hanging-realm-banner',scene);n.position.set(x,3.4,z);n.rotation.y=rotation;n.parent=root;
    box('banner-velvet',1.42,3.2,.035,0,1.2,0,material,n);
    for(const sx of [-.64,.64])box('embroidered-banner-border',.045,3.12,.05,sx,1.2,-.027,gold,n);
    const crest=torus('banner-crest',.73,.045,0,1.5,-.035,gold,n);crest.rotation.x=Math.PI/2;
    box('banner-crest-sword',.06,.92,.04,0,1.5,-.09,gold,n);box('banner-crest-guard',.44,.05,.04,0,1.65,-.09,gold,n);
    const pole=cylinder('banner-crossbar',.09,1.9,0,2.91,0,gold,n,8);pole.rotation.z=Math.PI/2;
  }
  banner(-11,-11,Math.PI/2);banner(11,-11,-Math.PI/2);banner(-22.95,2,Math.PI/2);banner(22.95,2,-Math.PI/2);
  // Treasury astrolabes and plinths echo the approved original Vault artwork.
  function astrolabe(x,z){
    cylinder('astrolabe-foot',1.1,.3,x,.15,z,trim);cylinder('astrolabe-stem',.18,1.3,x,.95,z,gold);
    for(let i=0;i<3;i++){const a=torus('armillary-sphere',1.8,.045,x,2.3,z,gold);a.rotation.x=.5+i*.6;a.rotation.z=i*.7;}
    sphere('armillary-core',.23,x,2.3,z,brightGold);
    obstacles.push({x,z,r:.65});
  }
  astrolabe(-9.35,15);astrolabe(9.35,15);
  function coins(x,z,count=24){
    const mound=sphere('treasure-gold-mound',1.75,x,.1,z,brightGold);mound.scaling.set(1,.15,.8);
    for(let i=0;i<count;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*1.25;const c=cylinder('scattered-gold-coin',.12+rand()*.1,.035,x+Math.cos(a)*r,.055+rand()*.13,z+Math.sin(a)*r,brightGold,root,8);c.rotation.z=(rand()-.5)*.6;}
    for(let i=0;i<3;i++){const g=sphere('polished-treasure-gem',.2+rand()*.14,x+(rand()-.5)*1.3,.22,z+(rand()-.5)*1.3,i%2?blueFire:violetFire);g.scaling.y=.7;}
  }
  for(const p of [[-20.4,2],[-18.4,4.4],[18.3,4.3],[20.2,2.3],[-2.3,16],[2.2,16.6]])coins(...p);
  // Golden floor compass / treasury seal, rendered as an original alpha mosaic.
  const sealMaterial=mat('vault-sigil-mosaic','#d9be77');sealMaterial.useAlphaFromDiffuseTexture=true;sealMaterial.backFaceCulling=false;
  sealMaterial.diffuseTexture=texture('original-orca-mosaic',(c,s)=>{
    c.clearRect(0,0,s,s);c.translate(s/2,s/2);c.strokeStyle='#a38c52';c.fillStyle='#a38c52';c.lineWidth=3;
    for(const r of [172,180,203,215]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();}
    for(let i=0;i<48;i++){c.save();c.rotate(i*Math.PI/24);c.fillRect(187,-2,12,4);c.restore();}
    for(let i=0;i<8;i++){c.save();c.rotate(i*Math.PI/4);c.beginPath();c.moveTo(0,-155);c.lineTo(16,-68);c.lineTo(0,-90);c.lineTo(-16,-68);c.closePath();c.fill();c.restore();}
    c.lineWidth=5;c.beginPath();c.moveTo(-87,14);c.bezierCurveTo(-35,-62,54,-60,98,-8);c.bezierCurveTo(46,-27,22,26,-10,54);c.bezierCurveTo(-28,39,-51,25,-87,14);c.stroke();
    c.beginPath();c.moveTo(4,-36);c.lineTo(22,-95);c.lineTo(43,-31);c.closePath();c.fill();
    c.font='bold 24px Georgia';c.textAlign='center';c.fillText('O R C A',0,114);
  });sealMaterial.diffuseTexture.hasAlpha=true;
  const seal=B.MeshBuilder.CreateGround('treasury-compass-seal',{width:8,height:8},scene);seal.position.set(0,.026,-1);seal.material=sealMaterial;seal.parent=root;staticMeshes.push(seal);
  // Chest bodies and lids are separate to support a proper physical opening.
  const chests=[];
  function chest(id,x,z,accent){
    const n=new B.TransformNode(`${id}-treasure-chest`,scene);n.position.set(x,.13,z);n.parent=root;
    box('treasure-dais',3.6,.25,2.6,0,-.005,0,trim,n,false);
    box('dais-brass-edging',3.65,.06,2.65,0,.1,0,gold,n,false);
    box('carved-oak-chest',2.3,.91,1.3,0,.6,0,wood,n,false);
    box('chest-dark-recess',2.02,.62,.04,0,.62,-.665,dark,n,false);
    for(const px of [-1.12,-.78,.78,1.12])box('chest-bronze-straps',.105,.95,1.38,px,.61,0,gold,n,false);
    for(const py of [.19,1.02])box('chest-front-frame',2.39,.1,.12,0,py,-.68,gold,n,false);
    for(const px of [-.98,.98])for(const py of [.31,.87])sphere('hammered-brass-rivet',.075,px,py,-.75,brightGold,n,false);
    const emblem=torus('treasure-front-emblem',.46,.045,0,.64,-.721,gold,n,false);emblem.rotation.x=Math.PI/2;
    sphere('chest-jewel-seal',.15,0,.64,-.77,accent,n,false);
    box('chest-latch',.17,.32,.13,0,.95,-.73,gold,n,false);
    const lid=new B.TransformNode(`${id}-lid-pivot`,scene);lid.position.set(0,1.04,.65);lid.parent=n;
    const paths=[];for(const px of [-1.16,1.16]){const path=[];for(let i=0;i<=16;i++){const t=Math.PI*i/16;path.push(new B.Vector3(px,Math.sin(t)*.48,-.65+Math.cos(t)*.68));}paths.push(path);}
    const skin=B.MeshBuilder.CreateRibbon('barrel-vaulted-chest-lid',{pathArray:paths,sideOrientation:B.Mesh.DOUBLESIDE},scene);skin.parent=lid;skin.material=wood;
    for(const px of [-1.14,-.78,.78,1.14]){const pts=[];for(let i=0;i<=16;i++){const t=Math.PI*i/16;pts.push(new B.Vector3(px,Math.sin(t)*.49,-.65+Math.cos(t)*.69));}lineTube('arched-brass-lid-band',pts,.055,gold,lid,false);}
    for(const pz of [0,-1.3])box('chest-lid-rim',2.36,.07,.1,0,.0,pz,gold,lid,false);
    const glow=sphere('sealed-chest-radiance',.35,0,1.32,-.65,accent,n,false);glow.scaling.set(1,.4,1);glow.visibility=.5;
    const particles=[];
    for(let i=0;i<6;i++){const p=sphere('chest-arcane-mote',.045,(rand()-.5)*2.6,1+rand()*2,(rand()-.5)*1.6,accent,n,false,4);particles.push({mesh:p,y:p.position.y,phase:rand()*6});}
    animated.push({type:'chest',glow,particles,root:n});
    const entry={id,root:n,lid,position:new B.Vector3(x,0,z),glow};chests.push(entry);obstacles.push({x,z,r:1.05});
    return entry;
  }
  chest('management',-19,3,blueFire);chest('positioning',19,3,violetFire);chest('earnings',0,16,fireMat);
  // Gridded iron portcullis with a gilded research seal.
  const gateRoot=new B.TransformNode('coliseum-portcullis',scene);gateRoot.position.set(0,0,23);gateRoot.parent=root;
  for(let i=-3;i<=3;i++)box('portcullis-upright',.12,6.4,.18,i,.0+3.2,0,gold,gateRoot,false);
  for(const y of [1.3,3,4.7,6.3])box('portcullis-crossbar',7.2,.16,.2,0,y,0,gold,gateRoot,false);
  const gateSeal=torus('gate-circular-emblem',1.4,.09,0,3.3,-.2,gold,gateRoot,false);gateSeal.rotation.x=Math.PI/2;
  for(const x of [-3.9,3.9])pillar(x,23,6.7,false);
  arch(0,23,3.9,6.7,2.2,gold);
  let gateOpen=false;
  // A complete compact coliseum, with spectator tiers and a distinctive combat circle.
  for(const x of [-15.4,15.4])box('arena-side-wall',.8,7.2,29,x,3.6,41,stone);
  box('arena-rear-wall',31,7.2,.8,0,3.6,55.4,stone);
  for(const x of [-9.5,9.5])box('arena-entry-wall',11,7.2,.8,x,3.6,26.6,stone);
  for(const x of [-13.2,13.2])for(let i=0;i<3;i++)box('stone-spectator-tier',1.3,.6+i*.5,24,x+Math.sign(x)*i*.6,.3+i*.25,41,trim);
  for(const x of [-13,13])for(const z of [30,38,46,53])pillar(x,z,7.5,true);
  for(const x of [-8,-4,0,4,8]){
    box('far-spectator-tier',3.9,1.2,2,x,.6,53.5,trim);
    banner(x,54.8,0,blueCloth);
  }
  for(const r of [8.0,8.3,9.0]){const ring=torus('arena-inlaid-combat-circle',r*2,.06,0,.025,41,gold);}
  const arenaMat=mat('arena-sandstone','#80745a');arenaMat.specularColor=hex('#2d2517');
  cylinder('coliseum-stone-dueling-ring',17.8,.035,0,.018,41,arenaMat,root,64);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const m=box('arena-radial-rune',.16,.045,.7,Math.sin(a)*7.4,.05,41+Math.cos(a)*7.4,gold);m.rotation.y=a;}
  // Original candles, braziers and restrained real point lights.
  const lights=[],flames=[];
  function brazier(x,z,light=true,color=new B.Color3(1,.64,.26)){
    cylinder('brazier-stone-base',.8,.18,x,.09,z,trim);
    cylinder('brazier-gold-stand',.18,1.05,x,.71,z,gold);
    cylinder('brazier-hammered-bowl',.75,.4,x,1.38,z,gold,root,12,true,1.05);
    const flame=sphere('brazier-living-flame',.55,x,1.87,z,fireMat,root,false,8);flame.scaling.set(.6,1.5,.6);flames.push({mesh:flame,phase:rand()*6});
    for(let i=0;i<3;i++)sphere('brazier-ember',.06,x+(rand()-.5)*.3,2.2+rand()*.6,z+(rand()-.5)*.3,fireMat);
    if(light){const l=new B.PointLight('warm-brazier-light',new B.Vector3(x,2.35,z),scene);l.diffuse=color;l.specular=new B.Color3(.24,.16,.07);l.intensity=1.75;l.range=13;lights.push(l);}
    obstacles.push({x,z,r:.47});
  }
  brazier(-5,-14,true);brazier(5,-14,false);brazier(-5.5,9,true);brazier(5.5,9,false);
  brazier(-20,6,true,new B.Color3(.53,.77,1));brazier(20,6,true,new B.Color3(.7,.46,1));
  brazier(-6,31,true);brazier(6,31,false);brazier(-6,50,false);brazier(6,50,true);
  const ambient=new B.HemisphericLight('vault-ambient',new B.Vector3(.3,1,-.5),scene);ambient.diffuse=hex('#e5dfcc');ambient.groundColor=hex('#576273');ambient.intensity=.82;ambient.renderPriority=20;
  const sunlight=new B.DirectionalLight('oculus-sunlight',new B.Vector3(-.35,-1,.4),scene);sunlight.position.set(1,14,-3);sunlight.diffuse=hex('#ffe2ad');sunlight.intensity=.92;sunlight.renderPriority=30;
  lights.push(ambient,sunlight);
  // Translucent narrow shafts catch dust without being opaque camera-facing sheets.
  const shaftMat=mat('golden-volume-shafts','#f9d691','#785b27',.035);shaftMat.backFaceCulling=false;shaftMat.disableLighting=true;shaftMat.needDepthPrePass=true;
  if(!options.reducedMotion)for(let i=0;i<4;i++){
    const sx=-2+i*1.2; const shaft=B.MeshBuilder.CreateCylinder('oculus-light-shaft',{diameterTop:.45,diameterBottom:2.3,height:13,tessellation:12},scene);shaft.position.set(sx,6.8,1+i*.5);shaft.rotation.z=-.2;shaft.material=shaftMat;shaft.parent=root;staticMeshes.push(shaft);
  }
  const dust=[];
  if(options.quality!=='low')for(let i=0;i<58;i++){
    const p=sphere('floating-gold-dust',.016+rand()*.019,(rand()-.5)*15,.5+rand()*8,-14+rand()*31,fireMat,root,false,3);p.visibility=.24+rand()*.4;dust.push({mesh:p,base:p.position.clone(),phase:rand()*6});
  }
  const contactMat=mat('soft-contact-shadows','#07080a',null,.75);contactMat.disableLighting=true;contactMat.useAlphaFromDiffuseTexture=true;
  contactMat.diffuseTexture=texture('original-contact-shading',(c,s)=>{c.clearRect(0,0,s,s);const g=c.createRadialGradient(s/2,s/2,s*.05,s/2,s/2,s*.5);g.addColorStop(0,'rgba(0,0,0,.9)');g.addColorStop(.4,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,s,s);});contactMat.diffuseTexture.hasAlpha=true;
  for(const o of obstacles){const sh=B.MeshBuilder.CreateGround('soft-object-contact',{width:o.r*4,height:o.r*4},scene);sh.position.set(o.x,.022,o.z);sh.material=contactMat;sh.parent=root;staticMeshes.push(sh);}
  scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.08;scene.imageProcessingConfiguration.contrast=1.04;
  scene.clearColor=new B.Color4(.032,.036,.044,1);scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.013;scene.fogColor=hex('#191923');
  // Merge immutable architecture by material. Detailed stonework stays cheap to render.
  const groups=new Map();for(const mesh of staticMeshes){const key=mesh.material.uniqueId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);}
  for(const meshes of groups.values()){
    if(meshes.length<2)continue;
    for(const mesh of meshes){mesh.computeWorldMatrix(true);mesh.bakeCurrentTransformIntoVertices();mesh.parent=null;}
    const merged=B.Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
    if(merged){merged.name='merged-vault-architecture';merged.parent=root;merged.receiveShadows=true;merged.freezeWorldMatrix();}
  }
  const regions=[[-11,11,-18,18],[-23,-11,-5,9],[11,23,-5,9],[-4,4,18,27],[-15,15,27,55]];
  function inside(x,z){return regions.some(([a,b,c,d])=>x>=a&&x<=b&&z>=c&&z<=d);}
  function isWalkable(x,z,radius=.45){
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    // Eight points protect corners and preserve doorways shared by adjacent regions.
    for(let i=0;i<8;i++){const a=i*Math.PI/4;if(!inside(x+Math.cos(a)*radius,z+Math.sin(a)*radius))return false;}
    return !obstacles.some(o=>(x-o.x)**2+(z-o.z)**2<(o.r+radius)**2);
  }
  return {
    root, spawn:{x:0,z:-14}, chests, gate:{root:gateRoot,position:new B.Vector3(0,0,23)}, arenaCenter:new B.Vector3(0,0,41), lights,
    isWalkable,
    setGateOpen(value){gateOpen=Boolean(value);},
    update(dt,time){
      gateRoot.position.y=B.Scalar.Lerp(gateRoot.position.y,gateOpen?6.7:0,Math.min(1,dt*2.8));
      for(const f of flames){const v=options.reducedMotion?1:1+Math.sin(time*8+f.phase)*.09;f.mesh.scaling.y=1.5*v;}
      if(!options.reducedMotion){
        for(const d of dust){d.mesh.position.x=d.base.x+Math.sin(time*.2+d.phase)*.35;d.mesh.position.y=d.base.y+Math.sin(time*.3+d.phase)*.22;}
        for(const c of animated){c.glow.visibility=.4+Math.sin(time*2)*.12;for(const p of c.particles)p.mesh.position.y=p.y+Math.sin(time+p.phase)*.23;}
      }
    },
    dispose(){root.dispose(false,true);for(const l of lights)l.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();}
  };
}
