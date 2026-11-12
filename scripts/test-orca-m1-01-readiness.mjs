import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'sql/orca_m1_01_research_readiness.sql'), 'utf8');
const sql = source.replace(/^--.*$/gm, '').trim();
const procedure = readFileSync(join(root, 'docs/m1-01-two-person-test-procedure.md'), 'utf8');

test('preflight queries are read-only and never select personal identities', () => {
  assert.match(sql, /SELECT\s+/i);
  assert.match(sql, /WITH\s+receipt\s+AS\s*\(/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|EXECUTE|CALL|DO)\s+(?:INTO|FROM|ON|TABLE|SCHEMA|FUNCTION|PUBLIC|\$)/i);
  assert.doesNotMatch(sql, /\b(?:pg_get_functiondef|auth\.users|auth\.identities|password|refresh_token|access_token|session_token)\b/i);
  assert.match(sql, /count\(DISTINCT contributor_id\)/i);
  assert.match(sql, /count\(DISTINCT m\.user_id\)/i);
});

test('receipt check verifies key owner, task, source, and board contracts', () => {
  for (const field of [
    'missing_task', 'unfinished_task', 'stock_mismatch', 'recorded_owner_mismatch',
    'missing_owned_profile', 'source_count_failure', 'future_dated', 'invalid_board_key',
    'board_stock_mismatch', 'historical_missing_board', 'newer_missing_board'
  ]) assert.ok(sql.includes(field), `missing assertion ${field}`);
  assert.match(sql, /LEFT JOIN public\.research_tasks/i);
  assert.match(sql, /LEFT JOIN public\.orca_research_board_assignments/i);
  assert.match(sql, /jsonb_typeof\(f\.source_urls\) = 'array'/i);
  assert.match(sql, /'execution','pricing','positioning'/);
  assert.match(sql, /'2026-11-01'::timestamptz/);
});

test('live procedure requires two separate real humans and never equates database history with acceptance', () => {
  assert.match(procedure, /two separate real people/i);
  assert.match(procedure, /two tabs in one browser profile are not isolation/i);
  assert.match(procedure, /Claim next research once/i);
  assert.match(procedure, /Publish \*\*once\*\*/i);
  assert.match(procedure, /A\/B acceptance: NOT RUN/i);
  assert.match(procedure, /immutable finding-owner join/i);
  assert.match(procedure, /Do not repeat genuine research/i);
});
