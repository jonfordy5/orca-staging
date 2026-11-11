/* Local transport fixtures only. This script does not sign in or contact a backend. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'research-workspace.html'), 'utf8');
const publicationStart = source.indexOf('function samePublicationSources(');
const publicationEnd = source.indexOf("$('refresh').addEventListener", publicationStart);
assert.ok(publicationStart >= 0 && publicationEnd > publicationStart, 'production publication functions found');
const publicationSource = source.slice(publicationStart, publicationEnd);
const localOwnerId = 'local-owner-fixture';
const localTaskId = 'local-task-fixture';
const localAlias = 'Local confirmation fixture';
const localSummary = 'Local validation fixture only. This text contains no financial research.';
const taggedSummary = '[ORCA-R4;Q:execution;A:BUY;D:BULLISH] ' + localSummary;
const localObservedAt = '2026-11-11T00:00:00.000Z';
const localSources = ['https://example.invalid/local-a', 'https://example.invalid/local-b'];

function setup(options = {}) {
  const state = { authCalls: 0, rpcCalls: [], resetCount: 0, messages: [], refreshOptions: null };
  const fields = {
    summary: { value: localSummary }, 'research-question': { value: 'execution' },
    'research-answer': { value: 'BUY' }, 'research-direction': { value: 'BULLISH' },
    sources: { value: localSources.join('\n') }, observed: { value: localObservedAt },
    'self-reviewed': { checked: true },
    'outlook-supporting-findings': { querySelectorAll: () => [] },
    'submit-form': { reset: () => { state.resetCount++; } }
  };
  const row = {
    id: 'local-finding-fixture', task_id: localTaskId, summary: taggedSummary,
    contributor_alias: localAlias, source_urls: [...localSources], observed_at: localObservedAt
  };
  if (options.mutateRow) options.mutateRow(row);
  const context = {
    ready: true, loading: false, user: { id: localOwnerId }, alias: localAlias,
    claim: { id: localTaskId, status: 'claimed' }, findings: [], tasks: [],
    isOrcaStaging: true, independentPublishingEnabled: false, ticker: 'LOCAL',
    assignedResearchBoard: { task_id: localTaskId, board_key: 'execution' },
    answerChoices: { execution: ['STRONG_BUY', 'BUY', 'SELL', 'STRONG_SELL'] },
    $: id => fields[id], Date,
    ratingMeta: (q, r, d) => `[ORCA-R4;Q:${q};A:${r};D:${d}] `,
    safeLink: value => {
      try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
      catch { return null; }
    },
    msg: () => {}, updatePublishedLength: () => {}, control: () => {},
    updateResearchAnswers: () => {}, localDateTime: () => '', renderClaim: () => {},
    errorInfo: error => error?.message || String(error),
    publishMsg: (message, kind) => state.messages.push({ message, kind }),
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (options.rpcError) throw new Error('Local transport failure');
      return options.rpcResponse; // undefined explicitly exercises legacy void returns.
    },
    refresh: async refreshOptions => {
      state.refreshOptions = refreshOptions;
      context.findings = options.missingRow ? [] : [row];
      context.tasks = options.missingTask ? [] : [{ id: localTaskId, status: options.taskStatus || 'completed' }];
      context.claim = options.claimAfterRefresh || null;
      if (options.notReady) context.ready = false;
      if (options.changeCachedOwner) context.user = { id: 'changed-local-owner-fixture' };
      return !options.refreshFailed;
    },
    sb: {
      auth: { getUser: async () => {
        const index = state.authCalls++;
        if (index === 1 && options.postAuthWait) {
          options.onPostAuthCheck?.();
          await options.postAuthWait;
        }
        if (options.authThrowAt === index) throw new Error('Local auth check unavailable');
        if (options.authErrorAt === index) return { data: {}, error: new Error('Local auth check failed') };
        const id = options.authOwners?.[index] ?? localOwnerId;
        return { data: { user: { id } }, error: null };
      } },
      functions: { invoke: async () => ({ data: null, error: null }) }
    }
  };
  vm.createContext(context);
  vm.runInContext(publicationSource, context);
  return {
    state, context, fields,
    run: () => context.publish({ preventDefault() {} })
  };
}

function expectUnconfirmed(fixture) {
  assert.equal(fixture.state.resetCount, 0, 'unconfirmed publication retains the form');
  assert.equal(fixture.state.messages.at(-1).kind, 'error');
  assert.match(fixture.state.messages.at(-1).message, /Draft retained/);
  assert.equal(fixture.fields.summary.value, localSummary);
  assert.equal(fixture.fields.sources.value, localSources.join('\n'));
}

test('void RPC result succeeds only after matching board evidence and completed task', async () => {
  const fixture = setup();
  await fixture.run();
  assert.equal(fixture.state.rpcCalls.length, 1);
  assert.deepEqual(Array.from(fixture.state.rpcCalls[0].args.p_source_urls), localSources);
  assert.equal(fixture.state.authCalls, 2);
  assert.equal(fixture.state.refreshOptions.forcePermissions, true);
  assert.equal(fixture.state.resetCount, 1);
  assert.equal(fixture.state.messages.at(-1).kind, 'success');
  assert.match(fixture.state.messages.at(-1).message, /Publication and completed assignment confirmed on the board/);
});

test('source URL order does not affect confirmation', async () => {
  const fixture = setup({ mutateRow: row => row.source_urls.reverse() });
  await fixture.run();
  assert.equal(fixture.state.resetCount, 1);
});

test('a second publish is blocked while final authentication confirmation is pending', async () => {
  let releaseAuth, reportAuthStarted;
  const postAuthWait = new Promise(resolve => { releaseAuth = resolve; });
  const authStarted = new Promise(resolve => { reportAuthStarted = resolve; });
  const fixture = setup({
    postAuthWait, onPostAuthCheck: reportAuthStarted,
    claimAfterRefresh: { id: localTaskId, status: 'claimed' }
  });
  const pendingPublication = fixture.run();
  await authStarted;
  assert.equal(fixture.context.loading, true);
  await fixture.run();
  assert.equal(fixture.state.rpcCalls.length, 1);
  releaseAuth();
  await pendingPublication;
  expectUnconfirmed(fixture);
  assert.equal(fixture.context.loading, false);
});

test('a different refreshed claim is preserved after confirmed publication', async () => {
  const nextClaim = { id: 'different-local-task-fixture', status: 'claimed' };
  const fixture = setup({ claimAfterRefresh: nextClaim });
  await fixture.run();
  assert.equal(fixture.state.resetCount, 1);
  assert.equal(fixture.context.claim, nextClaim);
});

for (const [description, options] of [
  ['finding missing', { missingRow: true }],
  ['different alias', { mutateRow: row => { row.contributor_alias = 'Different local fixture'; } }],
  ['different sources', { mutateRow: row => { row.source_urls = ['https://example.invalid/different']; } }],
  ['missing sources', { mutateRow: row => { delete row.source_urls; } }],
  ['unsafe extra source', { mutateRow: row => { row.source_urls.push('javascript:localFixture()'); } }],
  ['different observation time', { mutateRow: row => { row.observed_at = '2026-11-10T00:00:00Z'; } }],
  ['task missing', { missingTask: true }],
  ['task still claimed', { taskStatus: 'claimed' }],
  ['original claim still active', { claimAfterRefresh: { id: localTaskId, status: 'claimed' } }],
  ['refresh failed', { refreshFailed: true }],
  ['permission check not ready', { notReady: true }],
  ['cached owner changed', { changeCachedOwner: true }],
  ['current owner changed after publication', { authOwners: [localOwnerId, 'changed-local-owner-fixture'] }],
  ['postpublication auth check failed', { authErrorAt: 1 }],
  ['postpublication auth check threw', { authThrowAt: 1 }]
]) {
  test(`does not confirm when ${description}`, async () => {
    const fixture = setup(options);
    await fixture.run();
    expectUnconfirmed(fixture);
    assert.match(fixture.state.messages.at(-1).message, /may already be published.*check the board before retrying/);
    if (options.claimAfterRefresh) assert.equal(fixture.context.claim, options.claimAfterRefresh);
  });
}

for (const [description, options] of [
  ['current owner changed before publication', { authOwners: ['changed-local-owner-fixture'] }],
  ['prepublication auth check failed', { authErrorAt: 0 }],
  ['prepublication auth check threw', { authThrowAt: 0 }]
]) {
  test(`does not send a publish request when ${description}`, async () => {
    const fixture = setup(options);
    await fixture.run();
    expectUnconfirmed(fixture);
    assert.equal(fixture.state.rpcCalls.length, 0);
    assert.match(fixture.state.messages.at(-1).message, /Publish was not sent/);
  });
}

test('a failed publish transport retains the draft and requires board inspection', async () => {
  const fixture = setup({ rpcError: true });
  await fixture.run();
  expectUnconfirmed(fixture);
  assert.equal(fixture.state.rpcCalls.length, 1);
  assert.match(fixture.state.messages.at(-1).message, /check the board before retrying/);
});

test('My assignment exposes the exact task ID beside the metric and deadline', () => {
  const begin = source.indexOf('function renderClaim(){');
  const end = source.indexOf('async function checkReady()', begin);
  const fields = { myclaim: { textContent: '', style: {} }, 'research-question': {} };
  const context = {
    $: id => fields[id], user: { id: localOwnerId }, ready: true,
    claim: { id: localTaskId, research_area: 'Local audit metric', claimed_until: localObservedAt },
    assignedResearchBoard: { task_id: localTaskId, board_key: 'execution', board_label: 'Management' },
    time: value => value, updateResearchAnswers: () => {}, control: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end), context);
  context.renderClaim();
  assert.match(fields.myclaim.textContent, /Task ID: local-task-fixture/);
  assert.match(fields.myclaim.textContent, /Research board: Management/);
  assert.match(fields.myclaim.textContent, /Deadline:/);
});
