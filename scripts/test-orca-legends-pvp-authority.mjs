import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatch, receiveInput, setConnection, stepMatch, publicSnapshot, PVP_RULES } from '../game/pvp-authority.js';

const send=(match,slot,seq,action=null,extras={})=>receiveInput(match,slot,{
  seq, mx:0,mz:0,yaw:slot===0?Math.PI/2:-Math.PI/2,block:false,action,...extras,
});
const ticks=(match,count)=>{for(let i=0;i<count&&match.phase==='playing';i++)stepMatch(match);};

test('requires exactly two distinct server-authenticated participant keys',()=>{
  for(const subjects of [[],['a'],['a','a'],['a','b','c'],['a',null]]){
    assert.throws(()=>createMatch(subjects));
  }
  assert.equal(createMatch(['owner-a','owner-b']).players.length,2);
});
test('rejects malformed, repeated, out-of-slot and client-authority fields',()=>{
  const m=createMatch(['a','b']);
  for(const bad of [
    null,{}, {seq:-1,mx:0,mz:0,yaw:0},
    {seq:1,mx:100,mz:0,yaw:0},
    {seq:1,mx:0,mz:0,yaw:Infinity},
    {seq:1,mx:0,mz:0,yaw:0,action:'setWinner'},
    {seq:1,mx:0,mz:0,yaw:0,block:'true'}
  ])assert.equal(receiveInput(m,0,bad),false);
  assert.equal(receiveInput(m,2,{seq:0,mx:0,mz:0,yaw:0}),false);
  assert.equal(send(m,0,1,'light'),true);
  assert.equal(send(m,0,1,'heavy'),false);
  // Untrusted damage, health, position and purported winner cannot change state.
  assert.equal(receiveInput(m,1,{seq:1,mx:0,mz:0,yaw:-Math.PI/2,
    health:0,damage:99999,winnerSlot:1,x:0,z:0}),true);
  ticks(m,1);
  assert.equal(m.players[0].health,100);
  assert.equal(m.players[1].health,100);
  assert.equal(m.winnerSlot,null);
  assert.equal(m.players[1].x,4);
});
test('movement is bounded by fixed tick rate, input magnitude and arena limits',()=>{
  const m=createMatch(['a','b']);
  assert.equal(send(m,0,0,null,{mx:1,mz:1}),true);
  ticks(m,1);
  assert.ok(Math.abs(m.players[0].x-(-4+PVP_RULES.walkSpeed*.05/Math.sqrt(2)))<1e-8);
  assert.ok(Math.abs(m.players[0].z-PVP_RULES.walkSpeed*.05/Math.sqrt(2))<1e-8);
  ticks(m,1000);
  assert.equal(m.players[0].x,PVP_RULES.arenaRadius);
  assert.equal(m.players[0].z,PVP_RULES.arenaRadius);
});
test('melee hits only from correct direction and range; hit outcomes are server-calculated',()=>{
  const m=createMatch(['a','b']);
  send(m,0,0,'heavy');ticks(m,1);
  assert.equal(m.players[1].health,100,'initially out of heavy range');
  m.players[0].x=1;m.players[1].x=3;
  send(m,0,1,'light');ticks(m,1);
  assert.equal(m.players[1].health,100,'heavy cooldown prevents immediate second attack');
  ticks(m,20);
  send(m,0,2,'light');ticks(m,1);
  assert.equal(m.players[1].health,100-PVP_RULES.lightDamage);
  m.players[0].yaw=-Math.PI/2;
  send(m,0,3,'heavy',{yaw:-Math.PI/2});
  ticks(m,20);
  assert.equal(m.players[1].health,100-PVP_RULES.lightDamage,'wrong facing cannot hit');
});
test('block mitigates damage; dodge evades, stamina and mana cannot go negative',()=>{
  const m=createMatch(['a','b']);
  m.players[0].x=1;m.players[1].x=3;
  send(m,1,0,null,{block:true});
  send(m,0,0,'light');ticks(m,1);
  assert.equal(m.players[1].health,100-Math.max(1,Math.round(PVP_RULES.lightDamage*.45)));
  ticks(m,16);
  send(m,1,1,'dodge',{block:false});
  send(m,0,1,'heavy');ticks(m,1);
  assert.ok(m.events.some(e=>e.type==='evade'));
  assert.ok(m.players.every(p=>p.stamina>=0&&p.mana>=0));
});
test('server is sole authority for the winner and consumes a fixed input sequence',()=>{
  const m=createMatch(['a','b']);
  m.players[0].x=1;m.players[1].x=2;
  let seq=0;
  while(m.phase==='playing'&&seq<50){
    send(m,0,seq++,'heavy');ticks(m,20);
  }
  assert.equal(m.phase,'finished');
  assert.equal(m.winnerSlot,0);
  assert.equal(m.outcome,'knockout');
  assert.equal(m.players[1].health,0);
  const saved=JSON.stringify(publicSnapshot(m));ticks(m,100);
  assert.equal(JSON.stringify(publicSnapshot(m)),saved,'finished result immutable');
});
test('disconnect freezes movement, reconnects with new input, and grace timer forfeits',()=>{
  const m=createMatch(['a','b']);
  send(m,1,0,null,{mx:1});
  setConnection(m,1,false);
  ticks(m,10);assert.equal(m.players[1].x,4);
  assert.equal(receiveInput(m,1,{seq:1,mx:1,mz:0,yaw:0}),false);
  assert.equal(setConnection(m,1,true),true);
  send(m,1,1,null,{mx:1});ticks(m,1);
  assert.ok(m.players[1].x>4);
  setConnection(m,1,false);
  ticks(m,Math.ceil(PVP_RULES.disconnectGraceSeconds/PVP_RULES.tickSeconds)+1);
  assert.equal(m.phase,'finished');
  assert.equal(m.winnerSlot,0);
  assert.equal(m.outcome,'forfeit');
});
test('two disconnected users produce an abandoned result, not a fake winner',()=>{
  const m=createMatch(['a','b']);
  setConnection(m,0,false);setConnection(m,1,false);
  ticks(m,301);
  assert.equal(m.outcome,'abandoned');assert.equal(m.winnerSlot,null);
});
test('public snapshots never reveal private owner keys or input objects',()=>{
  const m=createMatch(['private-owner-a','private-owner-b']);
  send(m,0,0,'spell');stepMatch(m);
  const serialized=JSON.stringify(publicSnapshot(m));
  assert.doesNotMatch(serialized,/private-owner|ownerKey|acceptedInputs|seq|queued/);
  assert.deepEqual(publicSnapshot(m).players.map(p=>p.slot),[0,1]);
});
