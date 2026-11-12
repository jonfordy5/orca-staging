import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'sql/orca_staging_client_role_truncate_hardening.sql'), 'utf8');
const audit = readFileSync(join(root, 'sql/orca_staging_client_role_grant_audit.sql'), 'utf8');
const activeSQL = sql => sql.replace(/--[^\n]*/g, '').trim();

test('security fix only revokes client TRUNCATE on public tables and postgres future defaults', () => {
  const sql = activeSQL(migration);
  assert.match(sql, /BEGIN\s*;/i);
  assert.match(sql, /COMMIT\s*;/i);
  assert.match(sql, /REVOKE\s+TRUNCATE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon\s*,\s*authenticated\s*;/i);
  assert.match(sql, /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+TRUNCATE\s+ON\s+TABLES\s+FROM\s+anon\s*,\s*authenticated\s*;/i);
  assert.match(sql, /RAISE\s+EXCEPTION/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE\s+TABLE|ALTER\s+TABLE|GRANT|CREATE\s+TABLE)\s/i);
  assert.doesNotMatch(sql, /\b(?:production|service_role)\b/i);
});

test('audit contains only SELECT statements, checks both client roles and defaults', () => {
  const sql = activeSQL(audit);
  assert.match(sql, /VALUES\s*\(\s*'anon'\s*\)\s*,\s*\(\s*'authenticated'\s*\)/i);
  assert.match(sql, /pg_default_acl/i);
  assert.match(sql, /has_table_privilege/i);
  assert.match(sql, /SELECT/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REVOKE|GRANT|ALTER|TRUNCATE\s+TABLE|DROP|CREATE)\s/i);
});
