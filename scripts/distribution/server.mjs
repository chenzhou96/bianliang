import http from 'node:http';
import {
  readFile,
  stat,
  realpath,
  mkdir,
  writeFile,
  rm,
} from 'node:fs/promises';
import { dirname, resolve, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { settings } from './settings.mjs';

const base = dirname(fileURLToPath(import.meta.url));
const root = await realpath(join(base, 'client'));
const build = JSON.parse(await readFile(join(base, 'build.json'), 'utf8'));
const { port, dataDir, stateFile } = settings();
const token = randomBytes(32).toString('hex');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.rsc': 'text/x-component',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__game_stop') {
      if (
        req.method !== 'POST' ||
        req.headers.authorization !== `Bearer ${token}`
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200);
      res.end('stopping');
      void shutdown();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    if (url.pathname === '/__game_health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          app: 'bianliang-homecoming-portable',
          buildId: build.buildId,
          pid: process.pid,
        }),
      );
      return;
    }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    file = await realpath(file);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    try {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      if (state.pid === process.pid) await rm(stateFile, { force: true });
    } catch {
      /* Another instance must never lose its state file. */
    }
    process.exit(0);
  });
}
server.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', async () => {
  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await writeFile(
      stateFile,
      JSON.stringify({ pid: process.pid, port, token, buildId: build.buildId }),
      { mode: 0o600 },
    );
    console.log(`汴梁归途 ${build.version}: http://127.0.0.1:${port}`);
  } catch (e) {
    console.error(e.message);
    void shutdown();
  }
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void shutdown();
  });
