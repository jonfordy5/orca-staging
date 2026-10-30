/*
 * ORCA staging — shared stock workspace contract
 * All ticker workspaces use ONE HTML page. A failure in this test blocks
 * the GitHub consistency check; it never touches Supabase or research data.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workspace = read('research-workspace.html');
const redirect = read('research-workspace-staging.html');
const search = read('orca-stock-search.js');
const company = read('orca-company-profile.js');
const auto = read('orca-auto-company-profile.js');
const failures = [];
let passed = 0;
function check(name, test) {
  try {
    assert.ok(test(), name);
    console.log('PASS ' + name);
    passed++;
  } catch (error) {
    failures.push(name);
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
check('One dynamic workspace handles every stock ticker', () =>
  workspace.includes("new URLSearchParams(location.search).get('ticker')"));
check('Search routes all tickers through shared workspace', () =>
  search.includes("orcaStagingHref('./research-workspace-staging.html',{ticker})") &&
  search.includes('window.location.assign(href(selected.ticker))'));
check('Staging alias forwards the ticker to canonical workspace', () =>
  redirect.includes("new URL('./research-workspace.html'") &&
  redirect.includes("target.searchParams.set('ticker', ticker)"));
check('Company profiles use one shared renderer, including RKLB', () =>
  company.includes('RKLB:Object.freeze') &&
  company.includes('renderUnifiedCompanyProfile(root,ticker,{') &&
  auto.includes('export function renderUnifiedCompanyProfile(') &&
  auto.includes('renderUnifiedCompanyProfile(root,ticker,{'));
check('Shared research panels are present exactly once', () =>
  ['execution','pricing','positioning'].every(key =>
    (workspace.match(new RegExp('id="investor-answer-' + key + '"','g')) || []).length === 1));
const elementIds = new Set([...workspace.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
check('No reference to a deleted literal DOM element ($)', () =>
  [...workspace.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].every(m => elementIds.has(m[1])));
check('Universal claim/research/publish form elements exist', () =>
  ['research-metric','request-assignment','research-question','research-answer',
    'summary','sources','publish','myclaim','collective-findings'].every(id => elementIds.has(id)));
const categories = workspace.slice(workspace.indexOf('const researchCategories=['),
  workspace.indexOf('const approvedMetrics='));
const metrics = [...categories.matchAll(/\{key:'([^']+)',area:'([^']+)'/g)].map(m => m[1]);
const catalog = ['sec.filings_catalysts','fundamentals.valuation','volume.relative',
  'volume.options','technical.technical_analysis','news.market_sentiment'];
check('All six approved research metrics appear exactly once', () =>
  metrics.length === catalog.length && catalog.every(k => metrics.filter(x => x === k).length === 1));
check('Research assignments always filter by selected ticker', () =>
  /from\('research_tasks'\).*?\.eq\('ticker',ticker\)/s.test(workspace));
check('Published findings always filter by selected ticker', () =>
  /from\('commons_research_findings'\).*?\.eq\('ticker',ticker\)/s.test(workspace));
check('Staging stock registration uses the selected ticker', () =>
  search.includes('JSON.stringify({ticker:selected.ticker})'));
check('All profiles share the same mission/method and company size headings', () =>
  auto.includes("'The mission and the method'") &&
  auto.includes("'Company size and impact'"));
console.log('\nShared workspace checks: ' + passed + ' passed, ' + failures.length + ' failed.');
if (failures.length) process.exitCode = 1;
