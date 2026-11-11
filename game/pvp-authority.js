// M1-02A: deterministic, server-side 1v1 rules. NOT a client networking or auth gate.
// Only a trusted match service may instantiate a match or map an authenticated
// connection to its player slot. Browser messages never carry a trusted owner ID.
export const PVP_RULES = Object.freeze({
  tickSeconds: 0.05, arenaRadius: 12, walkSpeed: 5.2, maxHealth: 100,
  maxStamina: 100, maxMana: 100, staminaRegen: 14, manaRegen: 6,
  lightDamage: 14, heavyDamage: 24, spellDamage: 20,
  lightCost: 14, heavyCost: 28, dodgeCost: 24, spellCost: 28,
  lightCooldown: 0.55, heavyCooldown: 0.95, spellCooldown: 1.4,
  dodgeSeconds: 0.35, disconnectGraceSeconds: 15,
});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const validSlot=slot=>Number.isInteger(slot)&&slot>=0&&slot<2;
const normAngle=x=>Math.atan2(Math.sin(x),Math.cos(x));
function combatant(slot,ownerKey){
  return { slot,ownerKey,x:slot===0?-4:4,z:0,yaw:slot===0?Math.PI/2:-Math.PI/2,
    health:100,stamina:100,mana:100,cooldown:0,spellCooldown:0,dodge:0,
    blocking:false,connected:true,disconnectedAt:null,seq:-1,
    input:{mx:0,mz:0,yaw:slot===0?Math.PI/2:-Math.PI/2,block:false},
    queued:null,acceptedInputs:0 };
}
export function createMatch(ownerKeys){
  // ownerKeys are opaque server-authenticated, independently eligible subjects,
  // never identifiers supplied by an untrusted client payload.
  if(!Array.isArray(ownerKeys)||ownerKeys.length!==2||
     ownerKeys.some(key=>typeof key!=='string'||key.length<1)||
     ownerKeys[0]===ownerKeys[1])throw new Error('Two distinct server-verified participants required');
  return {phase:'playing',elapsed:0,tick:0,winnerSlot:null,outcome:null,
    players:ownerKeys.map((key,slot)=>combatant(slot,key)),events:[]};
}
function validateInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const {seq,mx,mz,yaw,block=false,action=null}=input;
  if(!Number.isSafeInteger(seq)||seq<0||seq>2**53-1||
     !Number.isFinite(mx)||!Number.isFinite(mz)||Math.abs(mx)>1||Math.abs(mz)>1||
     !Number.isFinite(yaw)||Math.abs(yaw)>Math.PI*4||
     typeof block!=='boolean'||![null,'light','heavy','dodge','spell'].includes(action))return null;
  return {seq,mx,mz,yaw:normAngle(yaw),block,action};
}
export function receiveInput(state,slot,raw){
  if(state?.phase!=='playing'||!validSlot(slot)||!state.players?.[slot]?.connected)return false;
  const p=state.players[slot],input=validateInput(raw);
  if(!input||input.seq<=p.seq)return false;
  p.seq=input.seq;
  p.acceptedInputs++;
  p.input={mx:input.mx,mz:input.mz,yaw:input.yaw,block:input.block};
  // One pending ability per tick. A later movement packet cannot erase it.
  // A client cannot queue multiple attacks during the same server tick.
  if(input.action && !p.queued)p.queued=input.action;
  return true;
}
export function setConnection(state,slot,connected){
  if(state?.phase!=='playing'||!validSlot(slot)||typeof connected!=='boolean')return false;
  const p=state.players[slot];
  if(p.connected===connected)return true;
  p.connected=connected;p.disconnectedAt=connected?null:state.elapsed;
  p.queued=null;p.input={mx:0,mz:0,yaw:p.yaw,block:false};p.blocking=false;
  state.events.push({type:connected?'reconnected':'disconnected',slot,tick:state.tick});
  return true;
}
function hit(state,attacker,defender,range,damage,kind){
  const dx=defender.x-attacker.x,dz=defender.z-attacker.z;
  const distance=Math.hypot(dx,dz);
  const dot=(Math.sin(attacker.yaw)*dx+Math.cos(attacker.yaw)*dz)/(distance||1);
  if(distance>range||(distance>.15&&dot<Math.cos(1.3)))return;
  if(defender.dodge>0){state.events.push({type:'evade',slot:defender.slot,kind,tick:state.tick});return;}
  let actual=damage;
  if(defender.blocking&&defender.stamina>=10){
    actual=Math.max(1,Math.round(damage*.45));
    defender.stamina-=10;
  }
  defender.health=clamp(defender.health-actual,0,100);
  state.events.push({type:'hit',slot:attacker.slot,target:defender.slot,kind,damage:actual,tick:state.tick});
  if(defender.health===0){
    state.phase='finished';state.winnerSlot=attacker.slot;state.outcome='knockout';
    state.events.push({type:'result',winnerSlot:attacker.slot,outcome:'knockout',tick:state.tick});
  }
}
function act(state,p,other){
  const action=p.queued;p.queued=null;
  if(!action||p.health<=0)return;
  if(action==='dodge'){
    if(p.stamina<PVP_RULES.dodgeCost||p.dodge>0)return;
    p.stamina-=PVP_RULES.dodgeCost;p.dodge=PVP_RULES.dodgeSeconds;
    state.events.push({type:'dodge',slot:p.slot,tick:state.tick});return;
  }
  if(action==='spell'){
    if(p.mana<PVP_RULES.spellCost||p.spellCooldown>0||p.dodge>0)return;
    p.mana-=PVP_RULES.spellCost;p.spellCooldown=PVP_RULES.spellCooldown;
    state.events.push({type:'spell',slot:p.slot,tick:state.tick});
    hit(state,p,other,5,PVP_RULES.spellDamage,'spell');return;
  }
  const heavy=action==='heavy',cost=heavy?PVP_RULES.heavyCost:PVP_RULES.lightCost;
  if(p.stamina<cost||p.cooldown>0||p.dodge>0)return;
  p.stamina-=cost;p.cooldown=heavy?PVP_RULES.heavyCooldown:PVP_RULES.lightCooldown;
  state.events.push({type:action,slot:p.slot,tick:state.tick});
  hit(state,p,other,heavy?3.1:2.8,heavy?PVP_RULES.heavyDamage:PVP_RULES.lightDamage,action);
}
export function stepMatch(state){
  if(state?.phase!=='playing')return state;
  state.elapsed=Math.round((state.elapsed+PVP_RULES.tickSeconds)*1e6)/1e6;
  state.tick++;
  state.events=[];
  for(const p of state.players){
    if(!p.connected&&p.disconnectedAt!==null&&
       state.elapsed-p.disconnectedAt>=PVP_RULES.disconnectGraceSeconds){
      const other=state.players[1-p.slot];
      state.phase='finished';
      state.winnerSlot=other.connected?other.slot:null;
      state.outcome=other.connected?'forfeit':'abandoned';
      state.events.push({type:'result',winnerSlot:state.winnerSlot,outcome:state.outcome,tick:state.tick});
      return state;
    }
  }
  // Movement and resource regeneration are server-controlled, never in input data.
  for(const p of state.players){
    p.cooldown=Math.max(0,p.cooldown-PVP_RULES.tickSeconds);
    p.spellCooldown=Math.max(0,p.spellCooldown-PVP_RULES.tickSeconds);
    p.dodge=Math.max(0,p.dodge-PVP_RULES.tickSeconds);
    p.stamina=clamp(p.stamina+PVP_RULES.staminaRegen*PVP_RULES.tickSeconds,0,100);
    p.mana=clamp(p.mana+PVP_RULES.manaRegen*PVP_RULES.tickSeconds,0,100);
    if(!p.connected)continue;
    const i=p.input,mag=Math.hypot(i.mx,i.mz),scale=mag>1?1/mag:1;
    p.x=clamp(p.x+i.mx*scale*PVP_RULES.walkSpeed*PVP_RULES.tickSeconds,-PVP_RULES.arenaRadius,PVP_RULES.arenaRadius);
    p.z=clamp(p.z+i.mz*scale*PVP_RULES.walkSpeed*PVP_RULES.tickSeconds,-PVP_RULES.arenaRadius,PVP_RULES.arenaRadius);
    p.yaw=i.yaw;p.blocking=i.block&&p.dodge===0;
  }
  // Alternating order prevents a permanent slot-zero first-hit advantage.
  const first=state.tick%2;
  act(state,state.players[first],state.players[1-first]);
  if(state.phase==='playing')act(state,state.players[1-first],state.players[first]);
  return state;
}
export function publicSnapshot(state){
  return {phase:state.phase,tick:state.tick,winnerSlot:state.winnerSlot,
    outcome:state.outcome,players:state.players.map(p=>({
      slot:p.slot,x:p.x,z:p.z,yaw:p.yaw,health:p.health,stamina:p.stamina,mana:p.mana,
      blocking:p.blocking,connected:p.connected
    })),events:state.events.map(e=>({...e}))};
}
