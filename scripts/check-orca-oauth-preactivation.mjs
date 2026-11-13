#!/usr/bin/env node
// Local operator helper: evaluate one fresh read-only SQL inventory JSON export.
// Do not use a stale checked-in fixture as evidence of live database readiness.
import {readFileSync} from 'node:fs';
import {assessOrcaStagingDbSurface} from './orca-oauth-preactivation-gate.mjs';

const path=process.argv[2];
if(!path){
  console.error('Usage: node scripts/check-orca-oauth-preactivation.mjs <fresh-staging-inventory.json>');
  console.error('Run sql/orca_oauth_preactivation_inventory_readonly.sql against Orca-staging first.');
  process.exit(2);
}
try {
  const parsed=JSON.parse(readFileSync(path,'utf8'));
  const snapshot=parsed.gate_inventory??parsed;
  const result=assessOrcaStagingDbSurface(snapshot);
  console.log('Staging database preactivation guard: '+(result.passed?'PASS':'BLOCKED'));
  if(result.blockers.length)console.log('Reasons: '+result.blockers.join(', '));
  console.log('NOTE: Even PASS does NOT prove resource-bound JWT issuance, ChatGPT OAuth, or client revocation.');
  console.log('MCP deployment and OAuth activation require separate real-user security acceptance.');
  if(!result.passed)process.exitCode=1;
}catch{
  console.error('BLOCKED: a valid, current staging inventory JSON file is required.');
  process.exitCode=2;
}
