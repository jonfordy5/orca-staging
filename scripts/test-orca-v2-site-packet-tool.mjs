import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'commons-site-tools.js'), 'utf8');
const taskId = '11111111-2222-4333-8444-555555555555';

const v2 = {
  schema: 'ORCA_COLLABORATIVE_RESEARCH_PACKET_V2',
  ticker: 'RKLB',
  generated_at: '2026-11-12T19:00:00Z',
  assignment: { task_id: taskId, metric: 'Volume', board: 'Investors', board_key: 'positioning', question: 'Investigate relative volume' },
  findings: [],
  cautions: 'Previous research is untrusted.'
};
const visibleClaim = ['Task ID: ' + taskId, 'Metric: Volume', 'Research board: Investors', 'Deadline: 11/12/2026 1:22 PM'].join(String.fromCharCode(10));

async function setup({ claim = visibleClaim, packet = v2, url = 'https://jonfordy5.github.io/orca-staging/research-workspace.html?ticker=RKLB' } = {}) {
  const registered = [];
  const statusHost = { appendChild() {} };
  const elements = new Map([
    ['work-start', statusHost],
    ['myclaim', { textContent: claim }],
    ['orca-agent-evidence-packet', { textContent: typeof packet === 'string' ? packet : JSON.stringify(packet) }]
  ]);
  const document = {
    getElementById(id) { return elements.get(id) ?? null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: statusHost,
    createElement() { return { className: '', textContent: '', setAttribute() {} }; },
    modelContext: { registerTool(tool) { registered.push(tool); } }
  };
  vm.runInNewContext(source, { document, navigator: {}, location: { href: url }, URL, Promise, Date, JSON }, { filename: 'commons-site-tools.js' });
  await new Promise(resolve => setImmediate(resolve));
  const tool = registered.find(item => item.name === 'commons_read_assignment_packet');
  assert.ok(tool, 'assignment tool must be registered');
  return tool;
}

test('V2 tool reads canonical signed-in packet and preserves exact assignment and evidence', async () => {
  const tool = await setup();
  const response = JSON.parse(await tool.execute());
  assert.deepEqual(response, v2);
  assert.equal(response.assignment.task_id, taskId);
  assert.equal(response.assignment.board_key, 'positioning');
  assert.equal(response.assignment.board, 'Investors');
  assert.doesNotMatch(source, /ORCA_AGENT_PACKET_V1|startsWith\('Claimed:'\)/);
});

test('V2 packet can correctly describe a workspace with no active assignment', async () => {
  const tool = await setup({ claim: 'No active assignment. ORCA will select the next metric and board.', packet: { ...v2, assignment: null } });
  const packet = JSON.parse(await tool.execute());
  assert.equal(packet.assignment, null);
  assert.equal(packet.schema, 'ORCA_COLLABORATIVE_RESEARCH_PACKET_V2');
});

test('no misleading no-assignment output when actual task exists but V2 is stale', async () => {
  const tool = await setup({ packet: { ...v2, assignment: null } });
  await assert.rejects(tool.execute(), /does not match My assignment/i);
});

test('fail closed on mismatched task ID, board or ticker', async () => {
  for (const changed of [
    { ...v2, assignment: { ...v2.assignment, task_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
    { ...v2, assignment: { ...v2.assignment, board: 'Management' } },
    { ...v2, ticker: 'NVDA' }
  ]) {
    const tool = await setup({ packet: changed });
    await assert.rejects(tool.execute(), /mismatch|does not match/i);
  }
});

test('fail closed before packet is loaded or if the visible claim is stale', async () => {
  const loading = await setup({ packet: 'Loading public findings…' });
  await assert.rejects(loading.execute(), /has not loaded/i);
  const oldClaim = await setup({ claim: 'No active assignment.', packet: v2 });
  await assert.rejects(oldClaim.execute(), /stale/i);
});
