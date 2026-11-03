// 手元で動かすためのサーバー。静的な画面（public/）と、サーバー側の関数（/api/〇〇）を出す。
// 使い方：npm start → http://localhost:8787
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './lib/api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');

// .env を読む（Git には入れないファイル。キーはサーバー側だけで使う）
const env = { ...process.env };
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (env.CHIKARA_KEY_NASHI === '1') delete env.ANTHROPIC_API_KEY; // 予備の動きを試すとき

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5);
    let body = null;
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200_000) break;
      }
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
    }
    const [status, json] = await handle(name, req.method, body, env, req.socket.remoteAddress);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(json));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('見つかりません');
  }
});

const port = Number(env.PORT || 8787);
server.listen(port, () => {
  console.log(`チカラのスイッチ：http://localhost:${port}`);
  console.log(env.ANTHROPIC_API_KEY ? 'Claude：使う（キーあり）' : 'Claude：使わない（キー無し・予備の動き）');
});
