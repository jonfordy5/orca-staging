import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RARITIES, STARTER_ITEMS, DEMO_LOOT, Inventory, validateResearchItem, createDemoResearchProvider, createVerifiedCacheProvider } from '../game/loot.js';
import { ATTACKS, DODGE, canAct, inAttackArc, resolveDefense } from '../game/combat.js';
import { validateContributorEvidence, isLocalDevelopment } from '../game/access.js';

test('all three realm/category discoveries retain the approved mapping', () => {
  assert.deepEqual(DEMO_LOOT.map(({ chestId, researchArea, realm, slot }) => ({ chestId, researchArea, realm, slot })), [
    { chestId: 'management', researchArea: 'Management', realm: "The King's Keep", slot: 'shield' },
    { chestId: 'earnings', researchArea: 'Earnings', realm: 'The Vault', slot: 'weapon' },
    { chestId: 'positioning', researchArea: 'Positioning', realm: 'The Frontier', slot: 'spell' },
  ]);
  assert.deepEqual(RARITIES, ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']);
});

test('fixtures are valid, unique and explicitly distinguished from verified findings', () => {
  const items = [...STARTER_ITEMS, ...DEMO_LOOT];
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.ok(validateResearchItem(item), item.name);
    assert.equal(item.verification, 'demonstration');
    assert.match(item.summary, /DEMONSTRATION/);
    assert.match(item.attribution, /demonstration fixture/);
    assert.match(item.source.url, /^https:\/\/www\.sec\.gov\/edgar/);
  }
});

test('inventory awards once, equips only owned items, compares actual slot statistics and resets', () => {
  const inventory = new Inventory();
  assert.equal(inventory.list().length, 3);
  assert.deepEqual(inventory.getStats(), { damage: 17, defense: 0.45, spellDamage: 23 });
  assert.equal(inventory.equip('unowned-legendary'), false);
  for (const item of DEMO_LOOT) {
    assert.equal(inventory.add(item), true);
    assert.equal(inventory.add(item), false);
    assert.equal(inventory.equip(item.id), true);
    assert.equal(inventory.equipped[item.slot], item.id);
  }
  assert.deepEqual(inventory.getStats(), { damage: 23, defense: 0.65, spellDamage: 32 });
  const external = inventory.list();
  external[0].stats.damage = 999;
  assert.equal(inventory.items.get(STARTER_ITEMS[0].id).stats.damage, 17);
  inventory.reset();
  assert.equal(inventory.list().length, 3);
  assert.deepEqual(inventory.getStats(), { damage: 17, defense: 0.45, spellDamage: 23 });
});

test('the contract rejects malformed sources and stats that break the underdog balance envelope', () => {
  const item = structuredClone(DEMO_LOOT[1]);
  for (const patch of [{ stats: { damage: 999, defense: 0, spellDamage: 0 } }, { verification: 'unverified' }, { rarity: 'MYTHIC' }, { source: { id: 'x', label: 'x', url: 'javascript:alert(1)' } }, { appearance: { color: 'url(x)' } }]) {
    assert.equal(validateResearchItem({ ...item, ...patch }), false);
  }
  assert.equal(validateResearchItem(null), false);
});

test('demo provider is deterministic, clone-safe and returns no reward for an unknown chest', async () => {
  const provider = createDemoResearchProvider();
  const first = await provider.getLoot('earnings');
  first.stats.damage = 999;
  assert.equal((await provider.getLoot('earnings')).stats.damage, 23);
  assert.equal(await provider.getLoot('unknown'), null);
  assert.equal((await provider.getFindings()).length, 3);
});

test('future cache adapter rejects demonstrations and duplicate findings without creating research jobs', async () => {
  let loads = 0;
  const verified = { ...structuredClone(DEMO_LOOT[1]), verification: 'verified', findingId: 'finding:1', verifiedAt: '2026-11-09T00:00:00Z' };
  const provider = createVerifiedCacheProvider(async () => { loads++; return [...DEMO_LOOT, verified, { ...verified, id: 'duplicate-item' }, { ...verified, findingId: 'missing-date', verifiedAt: '' }]; });
  const findings = await provider.getFindings();
  assert.equal(loads, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, verified.id);
  assert.equal(provider.mode, 'verified-cache');
  assert.throws(() => createVerifiedCacheProvider(null), TypeError);
  await assert.rejects(createVerifiedCacheProvider(async () => null).getFindings(), TypeError);
});

test('starter and upgraded shields mitigate a frontal strike without granting immunity', () => {
  const strike = { damage: 40, stamina: 100 };
  assert.deepEqual(resolveDefense({ ...strike, blocking: false }), { damage: 40, staminaCost: 0, outcome: 'hit' });
  assert.deepEqual(resolveDefense({ ...strike, blocking: true, defense: STARTER_ITEMS[1].stats.defense }), { damage: 22, staminaCost: 10, outcome: 'blocked' });
  assert.deepEqual(resolveDefense({ ...strike, blocking: true, defense: DEMO_LOOT[0].stats.defense }), { damage: 14, staminaCost: 10, outcome: 'blocked' });
  // Even malformed incoming defense cannot turn an ordinary held block into immunity.
  assert.equal(resolveDefense({ ...strike, blocking: true, defense: 99 }).damage, 10);
});

test('a timed dodge avoids damage while a caller-expired dodge takes the strike', () => {
  const strike = { damage: 38, blocking: false, stamina: 0 };
  assert.deepEqual(resolveDefense({ ...strike, dodging: true }), { damage: 0, staminaCost: 0, outcome: 'evaded' });
  assert.deepEqual(resolveDefense({ ...strike, dodging: false }), { damage: 38, staminaCost: 0, outcome: 'hit' });
  // The caller supplies the invulnerability flag only during the early dodge window.
  assert.ok(DODGE.invulnerableUntil > 0 && DODGE.invulnerableUntil < DODGE.duration);
  assert.ok(DODGE.stamina > 0 && DODGE.speed > 0);
});

test('a perfect parry costs six stamina, but exhaustion breaks even a timed guard', () => {
  assert.deepEqual(resolveDefense({ damage: 40, blocking: true, perfect: true, stamina: 10 }), { damage: 0, staminaCost: 6, outcome: 'parried' });
  assert.deepEqual(resolveDefense({ damage: 40, blocking: true, perfect: true, stamina: 9 }), { damage: 40, staminaCost: 0, outcome: 'guard-broken' });
  assert.deepEqual(resolveDefense({ damage: 40, blocking: true, stamina: 0 }), { damage: 40, staminaCost: 0, outcome: 'guard-broken' });
});

test('melee attacks use facing and inclusive reach rather than radial damage', () => {
  const hero = { x: 0, z: 0, yaw: 0 };
  assert.equal(inAttackArc(hero, { x: 0, z: ATTACKS.light.reach }, ATTACKS.light.reach), true);
  assert.equal(inAttackArc(hero, { x: 0, z: ATTACKS.light.reach + 0.001 }, ATTACKS.light.reach), false);
  assert.equal(inAttackArc(hero, { x: 0, z: -1 }, ATTACKS.light.reach), false);
  assert.equal(inAttackArc(hero, { x: 2, z: 0 }, ATTACKS.light.reach), false);
  assert.equal(inAttackArc({ ...hero, yaw: Math.PI / 2 }, { x: 2, z: 0 }, ATTACKS.light.reach), true);
});

test('recovery, stamina and health prevent button-mashing while starter attacks remain viable', () => {
  const hero = { health: 100, stamina: ATTACKS.light.stamina, action: null };
  assert.equal(canAct(hero, ATTACKS.light.stamina), true);
  assert.equal(canAct({ ...hero, stamina: ATTACKS.light.stamina - 1 }, ATTACKS.light.stamina), false);
  assert.equal(canAct({ ...hero, action: { type: 'light', elapsed: ATTACKS.light.impact } }, 0), false);
  assert.equal(canAct({ ...hero, health: 0 }, 0), false);
  assert.equal(canAct({ ...hero, health: -1 }, 0), false);
  for (const attack of Object.values(ATTACKS)) {
    assert.ok(attack.impact > 0 && attack.impact < attack.duration, 'A strike has a readable windup and a recovery window.');
    assert.ok(attack.stamina > 0 && attack.stamina <= 30, 'A full stamina bar permits repeated starter attacks.');
    assert.ok(STARTER_ITEMS[0].stats.damage * attack.multiplier > 0);
  }
  assert.ok(ATTACKS.heavy.duration > ATTACKS.light.duration);
  assert.ok(ATTACKS.heavy.stamina > ATTACKS.light.stamina);
  assert.ok(ATTACKS.heavy.multiplier > ATTACKS.light.multiplier);
});

const contributor = () => ({
  profile: { id: 'agent-owner-1', opted_in: true },
  tasks: [{ id: 'mission-1', status: 'completed', assigned_agent: 'agent-owner-1' }],
  findings: [{
    task_id: 'mission-1', published_at: '2026-11-09T00:00:00Z',
    source_urls: ['https://www.sec.gov/edgar/browse/?CIK=1045810&owner=exclude'],
    summary: '[ORCA-R4;Q:execution;A:BUY;D:60] A source-backed published finding.',
  }],
});

test('regular participation requires consent, an own-agent completed mission and its published source-backed finding', () => {
  assert.equal(validateContributorEvidence(contributor()), true);
  const evidence = contributor();
  evidence.tasks.unshift({ id: 'another-task', assigned_agent: 'someone-else', status: 'completed' });
  evidence.findings.unshift({ task_id: 'unrelated-task', published_at: null, source_urls: [] });
  assert.equal(validateContributorEvidence(evidence), true, 'An unrelated row does not hide a qualifying own contribution.');
});

test('a visitor, consent checkbox, or unfinished personal-agent task alone cannot unlock public gameplay', () => {
  for (const profile of [null, {}, { id: 'agent-owner-1' }, { id: 'agent-owner-1', opted_in: false }, { id: 'agent-owner-1', opted_in: 'true' }, { id: '', opted_in: true }]) {
    assert.equal(validateContributorEvidence({ ...contributor(), profile }), false);
  }
  for (const status of ['open', 'claimed', 'active', 'in_progress', 'pending', 'failed', 'COMPLETED']) {
    const evidence = contributor(); evidence.tasks[0].status = status;
    assert.equal(validateContributorEvidence(evidence), false, status);
  }
  assert.equal(validateContributorEvidence({ ...contributor(), tasks: [] }), false);
  assert.equal(validateContributorEvidence({ ...contributor(), findings: [] }), false);
});

test("another agent's task and an unrelated public Commons finding do not satisfy the player's contribution", () => {
  const foreignTask = contributor(); foreignTask.tasks[0].assigned_agent = 'someone-else';
  assert.equal(validateContributorEvidence(foreignTask), false);
  const unrelatedFinding = contributor(); unrelatedFinding.findings[0].task_id = 'another-mission';
  assert.equal(validateContributorEvidence(unrelatedFinding), false);
  const anonymousTask = contributor(); delete anonymousTask.tasks[0].assigned_agent;
  assert.equal(validateContributorEvidence(anonymousTask), false);
});

test('eligibility rejects malformed evidence, unpublished findings and unsafe or missing source references', () => {
  for (const malformed of [null, undefined, {}, { profile: [], tasks: {}, findings: 'rows' }, { ...contributor(), tasks: null }, { ...contributor(), findings: null }]) {
    assert.equal(validateContributorEvidence(malformed), false);
  }
  for (const patch of [
    { published_at: null }, { published_at: '' }, { published_at: 'not-a-date' },
    { published_at: '2099-01-01T00:00:00Z' },
    { summary: 'A statement without the accepted ORCA publication marker.' },
    { summary: null }, { source_urls: [] }, { source_urls: null },
    { source_urls: ['javascript:alert(1)'] }, { source_urls: ['http://example.com/source'] },
    { source_urls: ['not-a-url'] },
  ]) {
    const evidence = contributor(); Object.assign(evidence.findings[0], patch);
    assert.equal(validateContributorEvidence(evidence), false, JSON.stringify(patch));
  }
});

test('completed alias-based R4 research unlocks only for its actual signed-in contributor', () => {
  const evidence = {
    ownerId: 'owner-123',
    profile: { id: 'profile-456', display_name: 'ORCA Test Researcher 1', opted_in: true },
    tasks: [{ id: 'task-rklb', status: 'completed', assigned_agent: 'ORCA Test Researcher 1', claimed_owner_id: null }],
    findings: [{ task_id: 'task-rklb', contributor_id: 'owner-123', summary: '[ORCA-R4;Q:pricing;A:BUY] Valid original-source finding.', published_at: '2026-11-10T05:53:29Z', source_urls: ['https://www.sec.gov/Archives/edgar/data/1/sample'] }],
  };
  assert.equal(validateContributorEvidence(evidence), true, 'The real ORCA alias format is accepted.');
  assert.equal(validateContributorEvidence({ ...evidence, ownerId: 'different-owner' }), false, 'A different signed-in user cannot claim another owner’s finding.');
  assert.equal(validateContributorEvidence({ ...evidence, findings: [{ ...evidence.findings[0], contributor_id: 'different-owner' }] }), false, 'Same-name researcher cannot borrow a public finding.');
  assert.equal(validateContributorEvidence({ ...evidence, tasks: [{ ...evidence.tasks[0], claimed_owner_id: 'different-owner' }] }), false, 'Claimed ownership must match if recorded.');
  assert.equal(validateContributorEvidence({ ...evidence, profile: { ...evidence.profile, opted_in: false } }), false, 'Revoking consent locks gameplay.');
});

test('development bypass is limited to exact loopback hostnames, never a public test query', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1']) assert.equal(isLocalDevelopment(hostname), true, hostname);
  for (const hostname of [undefined, '', 'jonfordy5.github.io', 'jonfordy5.github.io?test=1', 'localhost.evil.example', 'localhost:8000', '127.0.0.1.evil.example', '127.0.0.2', '0.0.0.0', 'https://localhost', 'example.com?localhost']) {
    assert.equal(isLocalDevelopment(hostname), false, String(hostname));
  }
  const publicTestUrl = new URL('https://jonfordy5.github.io/orca-staging/orca-legends-game.html?test=1&demo=1&localhost=1');
  assert.equal(isLocalDevelopment(publicTestUrl.hostname), false);
});

test('approved research workspace keeps its shared card identities, assets, and uncropped portraits', () => {
  const html = readFileSync(new URL('../research-workspace.html', import.meta.url), 'utf8');
  for (const id of ['investor-answer-execution', 'investor-answer-pricing', 'investor-answer-positioning']) assert.ok(html.includes(`id="${id}"`), id);
  for (const realm of ["The King's Keep", 'The Vault', 'The Frontier']) assert.ok(html.includes(realm), realm);
  for (const area of ['management', 'earnings', 'positioning']) {
    assert.ok(html.includes(`assets/orca-world-${area}.webp`));
    assert.ok(readFileSync(new URL(`../assets/orca-world-${area}.webp`, import.meta.url)).byteLength > 0);
  }
  assert.match(html, /object-fit:\s*contain/);
  assert.match(html, /aspect-ratio:\s*3\s*\/\s*4/);
});
