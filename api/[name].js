// Vercel のサーバー側の関数。/api/〇〇 をすべてここで受けて、lib/api.mjs に渡す。
// API キーは Vercel の環境変数（ANTHROPIC_API_KEY）にだけ置く。
import { handle } from '../lib/api.mjs';

export default async function handler(req, res) {
  const name = String(req.query.name || '');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'vercel';
  const [status, json] = await handle(name, req.method, req.body ?? null, process.env, ip);
  res.setHeader('cache-control', 'no-store');
  res.status(status).json(json);
}
