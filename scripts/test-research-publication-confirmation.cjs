/* Local client contract and transport fixtures only; these do not verify deployed definitions.
 * This script does not sign in or contact a backend. */
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
const localFindingId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID, deliberately not v4.
const localAlias = 'Local profile confirmation fixture';
const localMembershipAlias = 'Different local membership fixture';
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
    id: localFindingId, task_id: localTaskId, summary: taggedSummary,
    contributor_alias: localAlias, source_urls: [...localSources], observed_at: localObservedAt
  };
  if (options.mutateRow) options.mutateRow(row);
  const context = {
    ready: true, loading: false, user: { id: localOwnerId },
    alias: localMembershipAlias, publicationAlias: localAlias,
    claim: { id: localTaskId, status: 'claimed' }, findings: [], tasks: [],
    isOrcaStaging: true, independentPublishingEnabled: options.independentPublishingEnabled === true, ticker: 'LOCAL',
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
      return Object.hasOwn(options, 'rpcResponse') ? options.rpcResponse : localFindingId;
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
  assert.match(fixture.state.messages.at(-1).message, /draft retained/i);
  assert.equal(fixture.fields.summary.value, localSummary);
  assert.equal(fixture.fields.sources.value, localSources.join('\n'));
}

test('the scalar finding UUID confirms a matching row with the profile alias despite a different membership name', async () => {
  const fixture = setup();
  await fixture.run();
  assert.notEqual(fixture.context.alias, fixture.context.publicationAlias);
  assert.equal(fixture.state.rpcCalls.length, 1);
  assert.equal(fixture.state.authCalls, 2);
  assert.equal(fixture.state.refreshOptions.forcePermissions, true);
  assert.equal(fixture.state.resetCount, 1);
  assert.equal(fixture.state.messages.at(-1).kind, 'success');
  assert.match(fixture.state.messages.at(-1).message, new RegExp('Finding ID: ' + localFindingId));
});

for (const [description, rpcResponse] of [
  ['undefined', undefined], ['null', null], ['empty', ''], ['malformed', 'not-a-uuid'],
  ['object', { id: localFindingId }], ['array', [localFindingId]]
]) {
  test(`${description} RPC return cannot confirm publication without the scalar finding UUID`, async () => {
    const fixture = setup({ rpcResponse });
    await fixture.run();
    expectUnconfirmed(fixture);
    assert.equal(fixture.state.rpcCalls.length, 1);
    assert.equal(fixture.state.refreshOptions, null);
    assert.match(fixture.state.messages.at(-1).message, /did not return a finding UUID/);
  });
}

for (const [description, independentPublishingEnabled, rpcName] of [
  ['regular', false, 'commons_publish_finding'],
  ['independent', true, 'commons_publish_independent_finding']
]) {
  test(`${description} client contract sends exactly the existing five arguments without owner or alias`, async () => {
    const fixture = setup({ independentPublishingEnabled });
    await fixture.run();
    assert.equal(fixture.state.rpcCalls.length, 1);
    const { name, args } = fixture.state.rpcCalls[0];
    assert.equal(name, rpcName);
    assert.deepEqual({ ...args, p_source_urls: Array.from(args.p_source_urls) }, {
      p_task_id: localTaskId,
      p_summary: taggedSummary,
      p_source_urls: localSources,
      p_observed_at: localObservedAt,
      p_limitations: ''
    });
    assert.equal(fixture.state.resetCount, 1);
  });
}

for (const [description, rpcResponse] of [
  ['object', { success: false, message: 'Local publication rejection' }],
  ['array', [{ success: false, message: 'Local publication rejection' }]]
]) {
  test(`an explicit ${description} RPC failure retains the draft without confirming publication`, async () => {
    const fixture = setup({ rpcResponse });
    await fixture.run();
    expectUnconfirmed(fixture);
    assert.equal(fixture.state.rpcCalls.length, 1);
    assert.equal(fixture.state.refreshOptions, null);
    assert.equal(fixture.state.messages.some(item => item.kind === 'success'), false);
    assert.match(fixture.state.messages.at(-1).message, /Local publication rejection/);
  });
}

test('an unchanged source array preserves duplicate URLs in the receipt', async () => {
  const fixture = setup({ mutateRow: row => { row.source_urls = [localSources[0], localSources[0]]; } });
  fixture.fields.sources.value = [localSources[0], localSources[0]].join('\n');
  await fixture.run();
  assert.equal(fixture.state.resetCount, 1);
});

test('an equivalent observation timestamp confirms the same instant', async () => {
  const fixture = setup({ mutateRow: row => { row.observed_at = '2026-11-11T01:00:00+01:00'; } });
  await fixture.run();
  assert.equal(fixture.state.resetCount, 1);
});

test('surrounding draft whitespace is trimmed before publication and receipt matching', async () => {
  const fixture = setup();
  fixture.fields.summary.value = ' \n' + localSummary + ' \t';
  await fixture.run();
  assert.equal(fixture.state.rpcCalls[0].args.p_summary, taggedSummary);
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
  ['matching metadata belongs to a different finding ID', { mutateRow: row => { row.id = '123e4567-e89b-12d3-a456-426614174001'; } }],
  ['returned finding belongs to a different task', { mutateRow: row => { row.task_id = 'different-local-task-fixture'; } }],
  ['returned finding has a different summary', { mutateRow: row => { row.summary = taggedSummary + ' Changed fixture.'; } }],
  ['different alias', { mutateRow: row => { row.contributor_alias = 'Different local fixture'; } }],
  ['only the membership alias matches', { mutateRow: row => { row.contributor_alias = localMembershipAlias; } }],
  ['different sources', { mutateRow: row => { row.source_urls = ['https://example.invalid/different']; } }],
  ['source URLs are reordered', { mutateRow: row => { row.source_urls.reverse(); } }],
  ['source URL normalization changes stored text', { mutateRow: row => { row.source_urls[0] = 'https://EXAMPLE.invalid/local-a'; } }],
  ['source duplicate count changes', { mutateRow: row => { row.source_urls.push(localSources[0]); } }],
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

for (const [description, publicationAlias] of [['missing', undefined], ['blank', ' '], ['nonstring', 42]]) {
  test(`a ${description} profile publication alias prevents sending a publish request`, async () => {
    const fixture = setup();
    fixture.context.publicationAlias = publicationAlias;
    await fixture.run();
    expectUnconfirmed(fixture);
    assert.equal(fixture.state.rpcCalls.length, 0);
    assert.match(fixture.state.messages.at(-1).message, /profile name could not be verified/);
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

test('permission checks read the publication alias from the owned profile and clear it after sign-out', async () => {
  const begin = source.indexOf('async function checkReady(){');
  const end = source.indexOf('async function refresh(', begin);
  assert.ok(begin >= 0 && end > begin, 'production permission check found');
  const queries = [];
  const fields = new Map();
  const context = {
    user: { id: localOwnerId }, ticker: 'LOCAL', isOrcaStaging: true,
    ready: false, independentPublishingEnabled: false,
    alias: '', publicationAlias: 'Stale fixture alias', lastPermissionCheck: 0, outlookAccessMessage: '', Date,
    $: id => {
      if (!fields.has(id)) fields.set(id, { textContent: '', classList: { toggle() {} } });
      return fields.get(id);
    },
    sb: { from: table => {
      const query = { table, columns: '', filters: [] };
      queries.push(query);
      return {
        select(columns) { query.columns = columns; return this; },
        eq(column, value) { query.filters.push([column, value]); return this; },
        async maybeSingle() {
          assert.ok(['stock_research_memberships', 'agent_profiles'].includes(table));
          return { data: table === 'stock_research_memberships'
            ? { display_name: localMembershipAlias }
            : { id: 'local-profile-fixture', display_name: localAlias, opted_in: true, independent_publish_enabled: false },
          error: null };
        }
      };
    } }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end), context);
  await context.checkReady();
  assert.equal(context.alias, localMembershipAlias);
  assert.equal(context.publicationAlias, localAlias);
  assert.equal(context.ready, true);
  assert.deepEqual(queries, [
    { table: 'stock_research_memberships', columns: 'display_name', filters: [['ticker', 'LOCAL'], ['user_id', localOwnerId]] },
    { table: 'agent_profiles', columns: 'id,display_name,opted_in,independent_publish_enabled', filters: [['owner_id', localOwnerId]] }
  ]);
  context.user = null;
  await context.checkReady();
  assert.equal(context.publicationAlias, '');
  assert.equal(context.ready, false);
});

test('My assignment exposes the exact task ID beside the metric and deadline', () => {
  const begin = source.indexOf('function renderClaim(){');
  const end = source.indexOf('async function checkReady()', begin);
  const fields = {
    myclaim: { textContent: '', style: {} },
    'research-question': { value: '', disabled: false, dataset: {} },
    'research-answer': { value: '' },
    'research-direction': { value: '' }
  };
  const context = {
    $: id => fields[id], user: { id: localOwnerId }, ready: true,
    claim: { id: localTaskId, research_area: 'Local audit metric', claimed_until: localObservedAt },
    assignedResearchBoard: { task_id: localTaskId, board_key: 'execution', board_label: 'Management' },
    answerChoices: { execution: ['STRONG_BUY', 'BUY', 'SELL', 'STRONG_SELL'], pricing: ['BUY', 'SELL'] },
    time: value => value,
    // R2 only changes display text; this fixture tests receipt/rating preservation.
    metricDisplayText: value => value,
    // Model the real updateResearchAnswers rebuilding the dropdown, clearing the selection.
    updateResearchAnswers: () => {
      fields['research-answer'].value = '';
      fields['research-direction'].value = '';
    },
    updateRatingDirection: () => {
      const rating = fields['research-answer'].value;
      fields['research-direction'].value = rating === 'BUY' ? 'BULLISH' : rating === 'SELL' ? 'BEARISH' : '';
    },
    control: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end), context);
  context.renderClaim();
  assert.match(fields.myclaim.textContent, /Task ID: local-task-fixture/);
  assert.match(fields.myclaim.textContent, /Research board: Management/);
  assert.match(fields.myclaim.textContent, /Deadline:/);

  fields['research-answer'].value = 'BUY';
  context.renderClaim();
  assert.equal(fields['research-answer'].value, 'BUY', 'same assignment refresh must preserve the chosen rating');
  assert.equal(fields['research-direction'].value, 'BULLISH', 'restored BUY must restore direction');

  context.assignedResearchBoard = { task_id: localTaskId, board_key: 'pricing', board_label: 'Earnings' };
  context.renderClaim();
  assert.equal(fields['research-answer'].value, '', 'changed board must clear stale rating');

  fields['research-answer'].value = 'SELL';
  context.claim = { ...context.claim, id: 'different-local-task-fixture' };
  context.assignedResearchBoard = { task_id: 'different-local-task-fixture', board_key: 'pricing', board_label: 'Earnings' };
  context.renderClaim();
  assert.equal(fields['research-answer'].value, '', 'changed task must clear stale rating');

  fields['research-answer'].value = 'BUY';
  context.claim = null;
  context.renderClaim();
  assert.equal(fields['research-answer'].value, '', 'no assignment must clear stale rating');
  assert.equal(fields['research-question'].dataset.renderedTaskId, '');
});
