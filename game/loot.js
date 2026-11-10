/**
 * ORCA Legends research-to-loot boundary.
 * All bundled findings are explicitly marked DEMONSTRATION. They make no
 * financial claim and are never submitted to ORCA's research systems.
 * Damage and rarity are authored game balance, unrelated to stock returns.
 */
export const RARITIES = Object.freeze(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']);
const SLOTS = Object.freeze(['weapon', 'shield', 'spell']);
const DEMO_NOTICE = 'DEMONSTRATION — an authored research exercise, not a verified financial finding or investment advice.';
const SOURCE = Object.freeze({
  id: 'sec:nvda:1045810',
  label: 'NVIDIA filings on SEC EDGAR — source to investigate',
  url: 'https://www.sec.gov/edgar/browse/?CIK=1045810&owner=exclude'
});

function fixture(fields) {
  return Object.freeze({
    ticker: 'NVDA',
    category: fields.slot,
    researchArea: 'Training',
    source: SOURCE,
    sourceReference: SOURCE.id,
    attribution: 'ORCA Legends prototype authors — demonstration fixture; no researcher discovery credit claimed',
    verification: 'demonstration',
    verificationState: 'demonstration',
    balanceNote: 'Fantasy game values. Rarity and statistics do not measure investment merit or performance.',
    summary: DEMO_NOTICE,
    researchSummary: DEMO_NOTICE,
    ...fields,
    stats: Object.freeze({ damage: 0, defense: 0, spellDamage: 0, ...fields.stats }),
    appearance: Object.freeze({ ...fields.appearance }),
  });
}

export const STARTER_ITEMS = Object.freeze([
  fixture({
    id: 'starter-vaultsteel', name: 'Vaultsteel Longsword', slot: 'weapon', rarity: 'COMMON',
    ability: 'A reliable blade. Light strikes are quick; heavy strikes punish an exposed guardian.',
    appearance: { color: '#aebac6', style: 'steel' }, stats: { damage: 17 },
  }),
  fixture({
    id: 'starter-watchshield', name: 'Watchkeeper Shield', slot: 'shield', rarity: 'COMMON',
    ability: 'Reduces frontal damage while blocking. A block timed just before impact can stagger the attacker.',
    appearance: { color: '#657f93', style: 'iron' }, stats: { defense: 0.45 },
  }),
  fixture({
    id: 'starter-cinder', name: 'Cinderbolt', slot: 'spell', rarity: 'COMMON',
    ability: 'Launch a bolt of arcane fire. Uses mana and has a recovery cooldown.',
    appearance: { color: '#f8af52', style: 'cinder' }, stats: { spellDamage: 23 },
  }),
]);

/** Transparent, deterministic chest table: every new expedition has one of each. */
export const DEMO_LOOT = Object.freeze([
  fixture({
    id: 'demo-management-aegis', chestId: 'management', name: "Steward's Aegis", slot: 'shield',
    rarity: 'RARE', researchArea: 'Management', realm: "The King's Keep",
    summary: `${DEMO_NOTICE} Management exercise: compare a company's governance disclosures and stated capital-allocation priorities. This shield does not assert that NVIDIA management has passed that examination.`,
    researchSummary: 'Training prompt: find the relevant governance and capital-allocation disclosures, record the filing date, and distinguish a management statement from independently demonstrated execution.',
    ability: 'A gilded ward that absorbs more damage on frontal blocks. Timing still determines a perfect parry.',
    appearance: { color: '#c5a45d', style: 'aegis' }, stats: { defense: 0.65 },
  }),
  fixture({
    id: 'demo-earnings-dawn', chestId: 'earnings', name: 'Dawn of the Ledger', slot: 'weapon',
    rarity: 'LEGENDARY', researchArea: 'Earnings', realm: 'The Vault',
    summary: `${DEMO_NOTICE} Earnings exercise: reconcile reported earnings, cash-flow disclosures, and explanatory notes. No growth, margin, earnings-quality, or stock-performance finding is claimed here.`,
    researchSummary: 'Training prompt: locate a dated earnings filing, trace each figure to its original statement, and separate accounting earnings from operating cash flow. The legendary tier is a demonstration loot-table choice.',
    ability: 'A luminous treasury blade. Modest bonus damage rewards good timing without making basic equipment obsolete.',
    appearance: { color: '#f3cb70', style: 'dawn' }, stats: { damage: 23 },
  }),
  fixture({
    id: 'demo-positioning-star', chestId: 'positioning', name: 'Frontier Star', slot: 'spell',
    rarity: 'EPIC', researchArea: 'Positioning', realm: 'The Frontier',
    summary: `${DEMO_NOTICE} Positioning exercise: identify disclosed competitive, industry, and concentration risks. This spell does not claim a verified competitive advantage or predict NVIDIA returns.`,
    researchSummary: 'Training prompt: inspect business and risk-factor sections, cite the date and original text, then distinguish a company claim from external corroboration and uncertainty.',
    ability: 'A focused azure projectile with greater arcane damage. Mana and cooldown still limit repeated casts.',
    appearance: { color: '#80bffa', style: 'star' }, stats: { spellDamage: 32 },
  }),
]);

const clone = (item) => JSON.parse(JSON.stringify(item));

/** Validate the small game-facing contract before an item enters inventory. */
export function validateResearchItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!SLOTS.includes(item.slot) || !RARITIES.includes(item.rarity)) return false;
  if (!['demonstration', 'verified'].includes(item.verification)) return false;
  for (const key of ['id', 'name', 'researchArea', 'ticker', 'summary', 'attribution', 'ability']) {
    if (typeof item[key] !== 'string' || item[key].trim().length === 0) return false;
  }
  if (!item.source || typeof item.source.id !== 'string' || typeof item.source.label !== 'string') return false;
  try { if (new URL(item.source.url).protocol !== 'https:') return false; } catch { return false; }
  if (!item.appearance || !/^#[a-f\d]{6}$/i.test(item.appearance.color)) return false;
  if (!item.stats || !['damage', 'defense', 'spellDamage'].every((key) => Number.isFinite(item.stats[key]) && item.stats[key] >= 0)) return false;
  // Explicit balance envelope: incoming research cannot mint an unbeatable item.
  if (item.stats.damage > 28 || item.stats.defense > 0.75 || item.stats.spellDamage > 40) return false;
  if (item.slot === 'weapon' && item.stats.damage <= 0) return false;
  if (item.slot === 'shield' && item.stats.defense <= 0) return false;
  if (item.slot === 'spell' && item.stats.spellDamage <= 0) return false;
  return true;
}

export class Inventory {
  constructor() { this.items = new Map(); this.equipped = { weapon: null, shield: null, spell: null }; this.reset(); }
  reset() {
    this.items.clear();
    this.equipped = { weapon: null, shield: null, spell: null };
    for (const item of STARTER_ITEMS) { this.add(item); this.equip(item.id); }
  }
  add(item) {
    if (!validateResearchItem(item) || this.items.has(item.id)) return false;
    this.items.set(item.id, clone(item));
    return true;
  }
  equip(id) {
    const item = this.items.get(id);
    if (!item) return false;
    this.equipped[item.slot] = id;
    return true;
  }
  list() { return [...this.items.values()].map(clone); }
  getStats() {
    const weapon = this.items.get(this.equipped.weapon);
    const shield = this.items.get(this.equipped.shield);
    const spell = this.items.get(this.equipped.spell);
    return { damage: weapon?.stats.damage ?? 0, defense: shield?.stats.defense ?? 0, spellDamage: spell?.stats.spellDamage ?? 0 };
  }
}

export function createDemoResearchProvider() {
  return Object.freeze({
    mode: 'demonstration',
    async getFindings() { return DEMO_LOOT.map(clone); },
    async getLoot(chestId) { const item = DEMO_LOOT.find((entry) => entry.chestId === chestId); return item ? clone(item) : null; },
  });
}

/**
 * Future cache adapter. The caller supplies a read-only cache loader; there is
 * deliberately no network client, key, live worker, or automatic research job.
 * A trusted server must verify evidence and permissions before supplying rows.
 * These checks validate the transport contract, not financial truth.
 */
export function createVerifiedCacheProvider(loadCachedFindings) {
  if (typeof loadCachedFindings !== 'function') throw new TypeError('A read-only cache loader is required.');
  async function load() {
    const rows = await loadCachedFindings();
    if (!Array.isArray(rows)) throw new TypeError('The research cache must return an array.');
    const seen = new Set();
    return rows.filter((row) => {
      if (!validateResearchItem(row) || row.verification !== 'verified') return false;
      if (typeof row.findingId !== 'string' || typeof row.verifiedAt !== 'string' || !Number.isFinite(Date.parse(row.verifiedAt))) return false;
      if (seen.has(row.findingId)) return false;
      seen.add(row.findingId);
      return true;
    }).map(clone);
  }
  return Object.freeze({ mode: 'verified-cache', getFindings: load, async getLoot(chestId) { return (await load()).find((row) => row.chestId === chestId) ?? null; } });
}
