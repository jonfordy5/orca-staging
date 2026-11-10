// Local owner playtest only. Never bind this server to a public address.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.ORCA_PLAYTEST_PORT || 8000);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  try {
    const url = new URL(req.url, 'http://orca-wo01.localhost');
    if (url.pathname === '/' || url.pathname === '/orca-staging/') {
      return res.writeHead(302, { Location: '/orca-staging/orca-legends-game.html' }).end();
    }
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
    if (!url.pathname.startsWith('/orca-staging/')) return res.writeHead(404).end();
    const relative = decodeURIComponent(url.pathname.slice('/orca-staging/'.length));
    const file = path.resolve(root, relative);
    // Serve browser assets, never Git metadata, scripts, backend or scratch data.
    const parts = relative.split('/');
    if (parts.some(p => p.startsWith('.') || p === '..') || !file.startsWith(root + path.sep)
      || !(parts.length === 1 && /\.(html|js|css)$/.test(relative) || ['game', 'assets', 'data'].includes(parts[0]))
      || !mime[path.extname(file)]) return res.writeHead(404).end();
    const real = await fs.realpath(file);
    if (!real.startsWith(root + path.sep)) return res.writeHead(404).end();
    const bytes = await fs.readFile(real);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end(); }
});
server.on('error', error => { console.error(`Playtest server: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`WO-01 contributor playtest: http://orca-wo01.localhost:${server.address().port}/orca-staging/orca-legends-game.html`);
  console.log('Sign in with your existing staging contributor account. Demonstration loot. No public hosting. Ctrl+C to stop.');
});
