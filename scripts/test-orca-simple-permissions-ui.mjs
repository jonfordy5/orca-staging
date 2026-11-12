import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)), '..');
const file=path=>readFileSync(join(root,path),'utf8');
const participation=file('participation.html');
const join=file('join-research.html');
const profile=file('agent-profile.html');
const all=[participation,join,profile];

function ids(src){return [...src.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);}
function idsOf(src,id){return ids(src).filter(value=>value===id).length;}
function inlineJs(src){const m=src.match(/<script type="module">([\s\S]*?)<\/script>/);assert.ok(m,'inline module must exist');return m[1].replace(/^import[^\n]+;$/gm,'');}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function compile(src,path){try{new AsyncFunction(src);}catch(e){throw new Error(path+': '+e.message)}}

test('every changed page retains unique DOM identifiers and valid inline script syntax',()=>{
  for(const [path,html] of [['participation.html',participation],['join-research.html',join],['agent-profile.html',profile]]){
    const list=ids(html);assert.equal(list.length,new Set(list).size,path+' duplicate id');
    compile(inlineJs(html),path);
  }
});

test('research authorization has exactly one primary enable/pause action, preserving original owner consent RPC',()=>{
  assert.equal(idsOf(participation,'permission-action'),1);
  assert.equal(idsOf(participation,'enable'),0);
  assert.equal(idsOf(participation,'disable'),0);
  assert.match(participation,/currentConsent\?'Pause research':'Enable research'/);
  assert.match(participation,/commons_set_my_research_consent/);
  assert.match(participation,/p_opted_in:action==='enable'/);
  assert.match(participation,/confirm\('Pause research\?/);
  assert.match(participation,/<details class="advanced-settings">/);
  assert.match(participation,/no AI was launched/i);
});

test('team page provides one enable/pause control; leaving a team is behind explicit advanced settings',()=>{
  assert.equal(idsOf(join,'conn-toggle'),1);
  assert.equal(idsOf(join,'conn-enable'),0);
  assert.equal(idsOf(join,'conn-revoke'),0);
  assert.match(join,/connectionConsent===true\?'Pause research':'Enable research'/);
  assert.match(join,/commons_set_my_research_consent/);
  assert.match(join,/p_opted_in:action==='enable'/);
  assert.match(join,/<details class="advanced-settings"><summary>Team settings<\/summary><button id="leave"/);
  assert.match(join,/<details class="advanced-settings">\s*<summary>More settings<\/summary>/);
  assert.match(join,/conn-start.*connect-work\.html/);
  assert.match(join,/agent_sessions/);
  assert.match(join,/confirm\('Pause research and release unfinished assignments\?/);
});

test('publishing independence is optional and only visible when advanced preferences are opened',()=>{
  assert.equal(idsOf(profile,'independent-publish'),1);
  assert.match(profile,/<details class="advanced-settings"><summary>Publication review settings<\/summary>/);
  assert.match(profile,/Publish findings without asking me to approve each one/);
  assert.match(profile,/commons_set_my_independent_publishing/);
  assert.match(profile,/p_enabled:enabled/);
  assert.match(profile,/data\.independent_publish_enabled===true/);
  assert.match(profile,/Off by default|off by default/);
  assert.doesNotMatch(profile,/Allow my AI to publish its research independently/);
});

test('new site copy does not claim that enabling permissions connects an AI or grants trading access',()=>{
  assert.match(participation,/Research permission is not an AI connection/);
  assert.match(join,/it does not connect or start your assistant/);
  assert.match(profile,/does not start or connect your AI/);
  assert.ok(all.every(src=>!src.includes('Automatically connected AI worker')));
});
