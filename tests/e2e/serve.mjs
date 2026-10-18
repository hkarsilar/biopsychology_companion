// A tiny static server for the built site, used by the browser tests.
// It mimics GitHub Pages: the site lives under the base path, folders serve index.html,
// and unknown paths get 404.html with a 404 status.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] ?? 4322);
const base = (process.env.SITE_BASE ?? '/biopsychology_companion').replace(/\/$/, '');
const root = new URL('../../dist/', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

async function file(path) {
  try {
    const s = await stat(path);
    if (s.isDirectory()) return file(join(path, 'index.html'));
    return { path, body: await readFile(path) };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let found = null;
  if (url.pathname === base || url.pathname.startsWith(`${base}/`)) {
    const rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
    if (url.pathname.endsWith('/') || extname(rel)) found = await file(join(root, rel));
    else {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` });
      return res.end();
    }
  }
  if (!found) {
    const nf = await file(join(root, '404.html'));
    res.writeHead(404, { 'content-type': types['.html'] });
    return res.end(nf?.body ?? 'Not found');
  }
  res.writeHead(200, { 'content-type': types[extname(found.path)] ?? 'application/octet-stream' });
  res.end(found.body);
}).listen(port, '127.0.0.1', () => console.log(`Serving dist/ at http://127.0.0.1:${port}${base}/`));
