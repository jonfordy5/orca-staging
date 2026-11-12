// ORCA owner-scoped read-only agent identity + assignment logic.
// This module is intentionally transport-agnostic and never claims or publishes.
export const READONLY_SCHEMA = 'ORCA_AGENT_READONLY_V1';

export function normalizeStockTicker(input) {
  if (typeof input !== 'string') throw new Error('ticker_required');
  const ticker = input.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) throw new Error('invalid_ticker');
  return ticker;
}

function requireResult(result, operation) {
  if (!result || result.error) throw new Error(operation + '_unavailable');
  return result.data ?? null;
}

export async function readAgentState(client, ownerId, options = {}) {
  // ownerId MUST come from a verified server-side JWT, never request JSON.
  if (typeof ownerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ownerId)) {
    throw new Error('verified_identity_required');
  }
  const ticker = options.ticker == null ? null : normalizeStockTicker(options.ticker);
  const now = options.now instanceof Date ? options.now.getTime() : Date.now();
  if (!Number.isFinite(now)) throw new Error('invalid_clock');

  const profile = requireResult(
    await client.from('agent_profiles')
      .select('display_name,opted_in,independent_publish_enabled')
      .eq('owner_id', ownerId).maybeSingle(),
    'profile_check'
  );
  if (!profile) {
    return { schema: READONLY_SCHEMA, status: 'profile_required', ticker, researcher: null,
      research_enabled: false, publishing_review: 'review_required', joined: false, assignment: null };
  }

  const base = {
    schema: READONLY_SCHEMA,
    status: profile.opted_in === true ? 'ready' : 'permission_required',
    ticker, researcher: String(profile.display_name || '').slice(0, 60),
    research_enabled: profile.opted_in === true,
    publishing_review: profile.independent_publish_enabled === true ? 'independent_allowed' : 'review_required',
    joined: null,
    assignment: null
  };
  if (!ticker) return base; // whoami requires no ticker, does not select other accounts.

  const membership = requireResult(
    await client.from('stock_research_memberships')
      .select('ticker')
      .eq('user_id', ownerId).eq('ticker', ticker).maybeSingle(),
    'membership_check'
  );
  base.joined = Boolean(membership && membership.ticker === ticker);
  if (!base.joined) return { ...base, status: 'team_required' };
  if (!base.research_enabled) return base;

  const claim = requireResult(await client.rpc('commons_my_claim', {p_ticker: ticker}), 'assignment_check');
  if (!claim) return base;
  if (claim.ticker && claim.ticker !== ticker) throw new Error('assignment_ticker_mismatch');
  if (typeof claim.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(claim.id)) throw new Error('assignment_invalid');
  const deadline = Date.parse(claim.claimed_until || '');
  if (!Number.isFinite(deadline) || deadline <= now) {
    // Don't return an expired task as a valid one and don't auto-claim another.
    return { ...base, status: 'assignment_expired' };
  }

  const board = requireResult(
    await client.rpc('orca_my_assigned_board', {p_task_id: claim.id}), 'board_check'
  );
  if (!board || board.task_id !== claim.id || !['execution', 'pricing', 'positioning'].includes(board.board_key)) {
    throw new Error('assignment_board_mismatch');
  }
  return { ...base, status: 'assigned', assignment: {
    task_id: claim.id,
    metric: String(claim.research_area || ''),
    question: String(claim.research_question || ''),
    due_at: new Date(deadline).toISOString(),
    board: String(board.board_label || ''),
    board_key: board.board_key
  } };
}
