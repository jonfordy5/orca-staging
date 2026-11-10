const $ = (selector, root = document) => root.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const writeText = (el,value) => { const text=String(value ?? ''); if(el.textContent!==text)el.textContent=text; };
const writeWidth = (el,value) => { if(el.style.width!==value)el.style.width=value; };
const rarity = (item) => ['common','uncommon','rare','epic','legendary'].includes(String(item.rarity).toLowerCase()) ? String(item.rarity).toLowerCase() : 'common';
const sigil = '<svg class="sigil" viewBox="0 0 28 32" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.1" d="M14 1 26 8v16l-12 7L2 24V8Z M8 8h12l-6 16Z M8 8l6 7 6-7"/></svg>';
const symbol = (slot) => ({weapon:'⚔',shield:'◈',armor:'◈',spell:'✧',relic:'◇'}[slot] || '◇');
const controls = '<div class="controls-grid"><span><kbd>WASD</kbd> Move</span><span><kbd>Mouse</kbd> Look</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>LMB</kbd> Sword attack</span><span><kbd>R</kbd> Heavy attack</span><span><kbd>RMB / Q</kbd> Hold shield</span><span><kbd>Space</kbd> Dodge</span><span><kbd>F</kbd> Cast spell</span><span><kbd>E</kbd> Interact</span><span><kbd>I</kbd> Inventory</span><span><kbd>Esc</kbd> Pause / close</span></div>';

export class GameUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.root = $('#game-ui');
    this.mode = null;
    this.access = { allowed: false, localDemo: false, message: 'Checking contributor eligibility…' };
    this.settings = {quality:'high',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,volume:.45};
    this.timers = new Set();
    this.items = [];
    this.equipped = {};
    this.lastHealth = null;
    this.root.innerHTML = `
      <div class="hud" id="hud" hidden>
        <div class="hud-brand"><div class="brand-line">${sigil}<span>ORCA LEGENDS</span></div><div class="location-label" id="location-label">The Vault</div><div class="location-sub" id="location-sub">The Kingdom of Earnings</div><div class="hud-actions"><button class="icon-button" data-action="inventory">I · Inventory</button><button class="icon-button" data-action="pause">Esc · Menu</button></div></div>
        <div class="prototype-tag" id="prototype-tag">STAGING DEVELOPER TEST · DEMONSTRATION RESEARCH</div>
        <section class="quest-panel" aria-label="Expedition progress"><div class="eyebrow">Your expedition</div><div class="quest-title">Knowledge is power.</div><div class="quest-line"><span>Research chests</span><strong id="chest-count">0 / 3</strong></div><div class="quest-line"><span>Vault Guardian</span><strong id="guardian-status">UNDEFEATED</strong></div><div class="quest-line"><span>The Coliseum</span><strong id="arena-status">SEALED</strong></div><div class="quest-progress" id="quest-progress"><i></i><i></i><i></i><i></i></div><p class="quest-objective" id="quest-objective">Explore the treasury. Seek the three discoveries.</p></section>
        <div class="enemy-hud" id="enemy-hud" hidden><div class="enemy-name" id="enemy-name"></div><div class="enemy-track"><div class="enemy-fill" id="enemy-fill"></div></div><div class="enemy-intent" id="enemy-intent"></div></div>
        <div class="crosshair" aria-hidden="true"></div>
        <section class="vitals" aria-label="Hero resources"><div class="hero-name">THE SEEKER <span>KNIGHT / RESEARCHER</span></div>${['health','stamina','mana'].map(name=>`<div class="vital"><div class="vital-top"><span>${name}</span><span id="${name}-number">100 / 100</span></div><div class="vital-track" role="progressbar" aria-label="${name}" id="${name}-track" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div class="vital-fill ${name}-fill" id="${name}-fill"></div></div></div>`).join('')}</section>
        <div class="hotbar" aria-label="Combat controls">${[['attack','LMB','⚔','Strike'],['heavy','R','†','Heavy'],['block','RMB/Q','◈','Block'],['dodge','SPACE','↠','Dodge'],['spell','F','✧','Spell']].map(([id,key,icon,name])=>`<div class="skill" id="skill-${id}"><span class="skill-key">${key}</span><span class="skill-icon" aria-hidden="true">${icon}</span><span class="skill-name">${name}</span>${id==='spell'?'<span class="skill-cooldown" id="spell-cooldown" hidden></span>':''}</div>`).join('')}</div>
        <div class="hud-controls"><span><kbd>WASD</kbd> Move <kbd>Shift</kbd> Sprint</span><span><kbd>Mouse</kbd> Look <kbd>E</kbd> Interact</span><span><kbd>I</kbd> Inventory <kbd>Esc</kbd> Pause</span></div>
        <div class="camera-hint" id="camera-hint">Click the world to capture your mouse · Esc releases it</div>
        <div class="interaction" id="interaction" hidden><kbd>E</kbd><span id="interaction-text"></span></div>
      </div>
      <div class="damage-vignette" id="damage-vignette"></div>
      <div class="toasts" id="toasts" role="status" aria-live="polite"></div>
      <div class="intro-layer" id="intro-layer" hidden></div>
      <div class="modal-layer" id="modal-layer" hidden></div>`;
    this._click = event => this._handleAction(event);
    this._change = event => this._handleSetting(event);
    this._key = event => {
      if(event.key !== 'Tab' || !this.mode) return;
      const focusable = [...$('#modal-layer',this.root).querySelectorAll('button:not(:disabled),a[href],input,select')].filter(e=>!e.hidden);
      if (!focusable.length) return;
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey && (document.activeElement===first || !$('#modal-layer',this.root).contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    };
    this.root.addEventListener('click',this._click);
    this.root.addEventListener('change',this._change);
    document.addEventListener('keydown',this._key);
    this._pointer = () => { $('#camera-hint',this.root).hidden = !!document.pointerLockElement; };
    document.addEventListener('pointerlockchange',this._pointer);
    this.showStart();
  }
  _later(fn, ms) {const id=setTimeout(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id;}
  _modal(mode,html){
    this.mode=mode;
    if(document.pointerLockElement) document.exitPointerLock?.();
    const layer=$('#modal-layer',this.root);layer.innerHTML=html;layer.hidden=false;
    $('#hud',this.root).style.opacity=mode==='start'?'0':'.4';
    this._later(()=>layer.querySelector('button:not(:disabled),a[href]')?.focus({preventScroll:true}),0);
  }
  _handleAction(event){
    const button=event.target.closest('[data-action]');
    if(!button || !this.root.contains(button))return;
    const action=button.dataset.action;
    if(action==='start'){if(!this.access.allowed || !(this.loadingProgress>=1))return;this.hideModal();$('#hud',this.root).hidden=false;this.callbacks.onStart?.();}
    if(action==='check-access'){this.callbacks.onCheckAccess?.();}
    if(action==='resume'||action==='close-pause'){this.hideModal();this.callbacks.onResume?.();}
    if(action==='restart'){this.hideModal();this.callbacks.onRestart?.();}
    if(action==='pause'){this.showPause();this.callbacks.onPause?.();}
    if(action==='inventory'){this.callbacks.onInventory?.();}
    if(action==='close-inventory'){this.hideInventory();this.callbacks.onResume?.();}
    if(action==='select-item'){this.selectedId=button.dataset.itemId;this._renderInventory();}
    if(action==='equip'){
      const item=this.items.find(i=>i.id===button.dataset.itemId);
      if(item){this.equipped[item.slot]=item.id;this.callbacks.onEquip?.(item.id);this._renderInventory();}
    }
    if(action==='reload')location.reload();
  }
  _handleSetting(event){
    const key=event.target.dataset.setting;if(!key)return;
    const value=event.target.type==='checkbox'?event.target.checked:event.target.type==='range'?Number(event.target.value):event.target.value;
    this.settings[key]=value;this.setSettings(this.settings);this.callbacks.onSetting?.(key,value);
  }
  setLoading(progress,message='Preparing the treasury…'){
    this.loadingProgress=progress;this.loadingMessage=message;
    const fill=$('#loading-fill',this.root);if(fill)fill.style.width=`${clamp(progress<=1?progress*100:progress,0,100)}%`;
    const label=$('#loading-text',this.root);if(label)label.textContent=message;
    const button=$('[data-action="start"]',this.root);if(button)button.disabled=!(progress>=1) || !this.access.allowed;
  }
  showStart(){
    this._modal('start',`<section class="modal-card start-card" role="dialog" aria-modal="true" aria-labelledby="start-title"><div class="start-art"><img src="./assets/orca-world-earnings.webp" alt="The approved ORCA Vault artwork: an ancient golden treasury with an illuminated treasure chest."><div class="art-caption">The Vault · Earnings</div></div><div class="start-copy"><div class="brand-line">${sigil}<span>ORCA LEGENDS</span></div><h1 id="start-title">The Vault</h1><p class="start-subtitle">Where your AI becomes a legend.</p><p class="start-description">Enter an ancient treasury. Master the blade. Uncover three discoveries and carry their power into the Coliseum.</p><div class="demo-badge">STAGING DEVELOPER TEST · DEMONSTRATION RESEARCH</div><div class="access-panel" id="access-panel" role="status" aria-live="polite"></div><button class="primary-button" id="start-button" data-action="start" disabled>Enter the Vault <span aria-hidden="true">→</span></button><div class="loading-meter"><i id="loading-fill"></i></div><div class="loading-text" id="loading-text" role="status">Preparing the treasury…</div><div class="start-controls"><span><kbd>WASD</kbd> Move</span><span><kbd>Mouse</kbd> Look</span><span><kbd>I</kbd> Inventory</span></div><p class="desktop-note">A desktop keyboard and mouse are required for this prototype.</p><div class="start-footer"><span>Explore. Uncover. Forge your legend.</span><a href="./index.html">ORCA staging ↗</a></div><p class="fine-print" style="margin:17px 0 0">All chest findings are demonstrations. No live research calls. Game balance is independent of investment performance.</p></div></section>`);
    this._renderAccess();
    if(this.loadingProgress!==undefined)this.setLoading(this.loadingProgress,this.loadingMessage);
  }
  setAccess({allowed=false,localDemo=false,message=''}={}){
    this.access={allowed:allowed===true,localDemo:localDemo===true,message:String(message||'')};
    this._renderAccess();
    if(this.loadingProgress!==undefined)this.setLoading(this.loadingProgress,this.loadingMessage);
  }
  _renderAccess(){
    const panel=$('#access-panel',this.root);
    const access=this.access;
    if(panel){
      panel.dataset.access=access.allowed?'allowed':'locked';
      const label=access.localDemo?'LOCAL DEVELOPER TEST · LOCAL ELIGIBILITY BYPASS':access.allowed?'CONTRIBUTOR STAGING TEST':'CONTRIBUTOR ACCESS REQUIRED';
      const message=access.message||(access.localDemo?'Local test access only. This bypass does not grant public gameplay eligibility.':access.allowed?'Contributor eligibility confirmed. Every chest still uses demonstration research.':'Sign in, authorize your own assistant, and complete a source-backed ORCA mission to unlock play.');
      panel.innerHTML=`<div class="access-label">${escape(label)}</div><p class="access-message" id="access-message">${escape(message)}</p>${!access.allowed?'<nav class="access-links" aria-label="Contributor eligibility steps"><a href="./account.html">Sign in</a><a href="./join-research.html?ticker=NVDA">Join research</a><a href="./connect-work.html">Connect your assistant</a><a href="./research-workspace.html?ticker=NVDA">View missions</a></nav><button class="secondary-button access-recheck" data-action="check-access">Recheck eligibility</button>':''}`;
    }
    const tag=$('#prototype-tag',this.root);if(tag)writeText(tag,access.localDemo?'LOCAL DEVELOPER TEST · ELIGIBILITY BYPASS · DEMO RESEARCH':'CONTRIBUTOR STAGING TEST · DEMONSTRATION RESEARCH');
  }
  setHUD(state={}){
    for(const name of ['health','stamina','mana']){
      if(state[name]===undefined)continue;
      const max=Number(state[`max${name[0].toUpperCase()}${name.slice(1)}`])||100;
      const val=clamp(state[name],0,max);
      writeWidth($(`#${name}-fill`,this.root),`${val/max*100}%`);
      writeText($(`#${name}-number`,this.root),`${Math.ceil(val)} / ${max}`);
      const track=$(`#${name}-track`,this.root);if(track.getAttribute('aria-valuemax')!==String(max))track.setAttribute('aria-valuemax',max);if(track.getAttribute('aria-valuenow')!==String(Math.ceil(val)))track.setAttribute('aria-valuenow',Math.ceil(val));
      if(name==='health'){
        if(this.lastHealth!==null&&val<this.lastHealth){const vignette=$('#damage-vignette',this.root);vignette.classList.add('hit');this._later(()=>vignette.classList.remove('hit'),150);}
        this.lastHealth=val;
      }
    }
    if(state.location){const parts=state.location.split(' · ');writeText($('#location-label',this.root),parts[0]);if(parts[1])writeText($('#location-sub',this.root),parts.slice(1).join(' · '));else if(/coliseum/i.test(parts[0]))writeText($('#location-sub',this.root),'The Gilded Oath');}
    if(state.objective)writeText($('#quest-objective',this.root),state.objective);
    if(state.chests!==undefined){this.chestCount=Array.isArray(state.chests)?state.chests.filter(Boolean).length:Number(state.chests)||0;writeText($('#chest-count',this.root),`${this.chestCount} / 3`);}
    if(state.guardianDead!==undefined){this.guardianDead=state.guardianDead;writeText($('#guardian-status',this.root),state.guardianDead?'DEFEATED':'UNDEFEATED');}
    if(state.arenaUnlocked!==undefined)writeText($('#arena-status',this.root),state.arenaUnlocked?'OPEN':'SEALED');
    [...$('#quest-progress',this.root).children].forEach((e,i)=>e.classList.toggle('complete',i<3?i<(this.chestCount||0):!!this.guardianDead));
    if(state.spellCooldown!==undefined)this.setCombatState({spellCooldown:state.spellCooldown});
  }
  setCombatState(state={}){
    for(const [key,id] of [['blocking','block'],['dodging','dodge'],['heavy','heavy'],['attacking','attack']])if(state[key]!==undefined)$(`#skill-${id}`,this.root).classList.toggle('active',!!state[key]);
    if(state.spellCooldown!==undefined){const el=$('#spell-cooldown',this.root);el.hidden=state.spellCooldown<=0;writeText(el,state.spellCooldown>0?Math.ceil(state.spellCooldown):'');}
  }
  setPrompt(text){$('#interaction',this.root).hidden=!text;writeText($('#interaction-text',this.root),text||'');}
  setEnemy(enemy){
    $('#enemy-hud',this.root).hidden=!enemy;if(!enemy)return;
    writeText($('#enemy-name',this.root),enemy.name);
    writeWidth($('#enemy-fill',this.root),`${clamp(enemy.health/(enemy.maxHealth||1)*100,0,100)}%`);
    writeText($('#enemy-intent',this.root),enemy.intent||'');
  }
  toast(title,body='',itemRarity='common'){
    const el=document.createElement('div');el.className='toast';el.dataset.rarity=String(itemRarity).toLowerCase();
    el.innerHTML=`<p class="toast-title">${escape(title)}</p>${body?`<p class="toast-body">${escape(body)}</p>`:''}`;
    $('#toasts',this.root).append(el);while($('#toasts',this.root).children.length>3)$('#toasts',this.root).firstElementChild.remove();
    this._later(()=>el.remove(),5500);
  }
  showInventory(items=[],equipped={}){
    this.items=items;this.equipped={...equipped};
    if(!items.some(i=>i.id===this.selectedId))this.selectedId=items[0]?.id;
    this._renderInventory();
  }
  _renderInventory(){
    const item=this.items.find(i=>i.id===this.selectedId);
    this._modal('inventory',`<section class="modal-card inventory-card" role="dialog" aria-modal="true" aria-labelledby="inventory-title"><button class="close-button" data-action="close-inventory" aria-label="Close inventory">×</button><div class="inventory-heading"><div><div class="eyebrow">Treasures of the expedition</div><h2 class="modal-title" id="inventory-title">Your inventory</h2></div><div class="inventory-count">${this.items.length} items discovered</div></div><div class="inventory-layout"><div class="inventory-list" aria-label="Discovered equipment">${this.items.length?this.items.map(i=>`<button class="inventory-item ${i.id===this.selectedId?'selected':''}" data-action="select-item" data-item-id="${escape(i.id)}" aria-pressed="${i.id===this.selectedId}"><span class="item-symbol rarity-${rarity(i)}" aria-hidden="true">${symbol(i.slot)}</span><span class="item-copy"><span class="item-name rarity-${rarity(i)}">${escape(i.name)}</span><span class="item-meta">${escape(i.rarity)} · ${escape(i.slot)}${i.researchArea?` · ${escape(i.researchArea)}`:''}</span></span>${this.equipped[i.slot]===i.id?'<span class="item-equipped">Equipped</span>':''}</button>`).join(''):'<div class="empty-inventory">The treasury keeps its secrets.<br>Find a chest to discover your first artifact.</div>'}</div><div class="inventory-detail" id="inventory-detail">${item?this._itemDetail(item):'<div class="eyebrow">Your next discovery awaits</div><p class="detail-ability">Explore the side chambers and the guardian’s treasury.</p>'}</div></div><p class="inventory-footnote">Demonstration loot table. Rarity and combat statistics are balanced game mechanics, independent of company performance. Item evidence is labeled separately; no live AI research or purchases occur.</p></section>`);
  }
  _itemDetail(item){
    const equipped=this.items.find(i=>i.id===this.equipped[item.slot]);
    const stats=Object.entries(item.stats||{}).filter(([key,value])=>typeof value==='number'&&value!==0);
    const source=Array.isArray(item.source)?item.source[0]:item.source;
    const url=typeof source==='string'?source:source?.url;
    const safeUrl=/^https?:\/\//i.test(url||'')?url:null;
    const sourceLabel=typeof source==='string'?'Open original source':source?.label||'Open original source';
    const verification=typeof item.verification==='object'?(item.verification.label||item.verification.state||'Demonstration finding'):item.verification||'Demonstration finding';
    const ability=Array.isArray(item.ability)?item.ability.join(' · '):typeof item.ability==='object'?item.ability?.description||item.ability?.name:item.ability;
    return `<div class="detail-top"><span class="item-symbol rarity-${rarity(item)}" aria-hidden="true">${symbol(item.slot)}</span><div><span class="rarity-label rarity-${rarity(item)}">${escape(item.rarity)} · ${escape(item.slot)}</span><h3 class="detail-name">${escape(item.name)}</h3></div></div>${ability?`<p class="detail-ability">${escape(ability)}</p>`:''}${stats.length?`<div class="item-stats">${stats.map(([key,value])=>{const diff=equipped&&equipped.id!==item.id?value-(equipped.stats?.[key]||0):0;const percent=key==='defense'&&value<=1;const display=percent?`${Math.round(value*100)}%`:value;const delta=percent?`${Math.round(diff*100)}%`:Math.round(diff*100)/100;return `<div class="item-stat"><strong>${escape(display)}${diff?`<span class="stat-diff ${diff<0?'negative':''}">${diff>0?'+':''}${delta}</span>`:''}</strong>${escape(percent?'block absorption':key.replace(/([A-Z])/g,' $1'))}</div>`;}).join('')}</div>`:''}<button class="primary-button detail-equip" data-action="equip" data-item-id="${escape(item.id)}" ${this.equipped[item.slot]===item.id?'disabled':''}>${this.equipped[item.slot]===item.id?'Equipped':`Equip ${escape(item.slot)}`}</button><div class="research-detail"><h4>${escape(item.researchArea||'Expedition equipment')}${item.ticker?` / ${escape(item.ticker)}`:''}</h4><span class="verification-tag">${escape(verification)}</span><p>${escape(item.summary||'Starter equipment. No financial finding is associated with this item.')}</p>${safeUrl?`<a href="${escape(safeUrl)}" target="_blank" rel="noopener noreferrer" data-research-source>${escape(sourceLabel)} ↗</a>`:''}${item.attribution?`<p class="research-attribution">Attribution: ${escape(typeof item.attribution==='string'?item.attribution:item.attribution.name||JSON.stringify(item.attribution))}</p>`:''}</div>`;
  }
  hideInventory(){if(this.mode==='inventory')this.hideModal();}
  showPause(){
    this._modal('pause',`<section class="modal-card compact-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><button class="close-button" data-action="close-pause" aria-label="Resume game">×</button><div class="eyebrow">Take a breath, seeker</div><h2 class="modal-title" id="pause-title">Expedition paused</h2><div class="pause-menu"><button class="primary-button" data-action="resume">Resume expedition</button><button class="secondary-button" data-action="restart">Restart expedition</button></div><div class="settings-group"><h3>Settings</h3><label class="setting">Visual quality<select data-setting="quality"><option value="high">High</option><option value="low">Performance</option></select></label><label class="setting">Sound volume<input type="range" data-setting="volume" min="0" max="1" step="0.05" aria-label="Sound volume"></label><label class="setting">Reduced motion<input type="checkbox" data-setting="reducedMotion"></label></div><div class="settings-group"><h3>Controls</h3>${controls}</div><p class="fine-print" style="margin:22px 0 0">Watch an enemy’s wind-up. Block from the front, or dodge through danger. Heavy strikes spend more stamina; leave enough to escape.</p></section>`);
    this.setSettings(this.settings);
  }
  hideModal(){this.mode=null;const layer=$('#modal-layer',this.root);layer.hidden=true;layer.innerHTML='';$('#hud',this.root).style.opacity='1';$('#hud',this.root).hidden=false;}
  isModalOpen(){return !!this.mode;}
  showIntro(title,subtitle,duration=2500){
    const el=$('#intro-layer',this.root);el.innerHTML=`<div class="eyebrow">ORCA LEGENDS</div><h2>${escape(title)}</h2><p>${escape(subtitle)}</p><div class="gold-rule"></div>`;el.hidden=false;
    if(this.introTimer){clearTimeout(this.introTimer);this.timers.delete(this.introTimer);}
    this.introTimer=this._later(()=>{el.hidden=true;},duration);
  }
  showResult({won,title,subtitle,reward}={}){
    const rewardText=typeof reward==='object'?reward?.name||reward?.title:reward;
    this._modal('result',`<section class="modal-card result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-seal" aria-hidden="true">${won?'✧':'◇'}</div><div class="eyebrow">${won?'A legend is forged':'The expedition ends'}</div><h2 id="result-title">${escape(title||(won?'Victory':'Defeated'))}</h2><div class="gold-rule"></div><p class="result-subtitle">${escape(subtitle||(won?'Knowledge armed you. Skill won the duel.':'Learn the rhythm. Find your opening. Return stronger.'))}</p>${rewardText?`<div class="reward-panel"><span class="eyebrow">${won?'Expedition reward':'Next attempt'}</span><br>${escape(rewardText)}</div>`:''}<button class="primary-button" data-action="restart">${won?'Begin another expedition':'Try again'} <span aria-hidden="true">↻</span></button><p class="fine-print" style="margin:22px 0 0">All loot and research in this prototype are demonstrations.<br>Fantasy victories do not establish financial truth.</p></section>`);
  }
  setSettings(settings={}){
    this.settings={...this.settings,...settings};
    document.body.classList.toggle('reduced-motion',!!this.settings.reducedMotion);
    this.root.querySelectorAll('[data-setting]').forEach(el=>{const value=this.settings[el.dataset.setting];if(el.type==='checkbox')el.checked=!!value;else if(value!==undefined)el.value=value;});
  }
  showError(message){this._modal('error',`<section class="modal-card compact-card error-card" role="alertdialog" aria-modal="true" aria-labelledby="error-title"><div class="eyebrow">The Vault could not open</div><h2 class="modal-title" id="error-title">A passage is blocked</h2><p>Use a current desktop browser with WebGL and hardware acceleration enabled. Reload to try again.</p><p class="error-message">${escape(message)}</p><button class="primary-button" data-action="reload">Reload the game</button></section>`);}
  dispose(){this.timers.forEach(clearTimeout);this.root.removeEventListener('click',this._click);this.root.removeEventListener('change',this._change);document.removeEventListener('keydown',this._key);document.removeEventListener('pointerlockchange',this._pointer);this.root.innerHTML='';}
}
