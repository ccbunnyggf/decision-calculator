import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const target = normalize(join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')));
    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403).end('Forbidden'); return;
    }
    const file = (await stat(target)).isDirectory() ? join(target, 'index.html') : target;
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`Open http://${host}:${port}/`));
