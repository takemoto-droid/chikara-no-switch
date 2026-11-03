// 言葉の正本（data/言葉の正本.json）による機械的な点検
// 正本の「避ける言葉」が1つでも出たら見つける。画面の文・Claude の文・予備の文のすべてに使う。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

let cache = null;
export function seihon() {
  if (!cache) {
    cache = JSON.parse(readFileSync(path.join(ROOT, 'data', '言葉の正本.json'), 'utf8'));
  }
  return cache;
}

function norm(s) {
  return String(s).normalize('NFKC').toUpperCase();
}

// 文1つを点検して、見つかった言葉の一覧を返す
export function tenken(text) {
  const t = norm(text);
  const hits = [];
  for (const w of seihon()['避ける言葉']) {
    const key = norm(w['言葉']);
    let i = t.indexOf(key);
    while (i !== -1) {
      hits.push({ 言葉: w['言葉'], 寄せる言葉: w['寄せる言葉'], 位置: i });
      i = t.indexOf(key, i + key.length);
    }
  }
  return hits;
}

// オブジェクトの中の文をすべて集める
export function mojiretsu(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => mojiretsu(v, out));
  else if (typeof obj === 'object') Object.values(obj).forEach((v) => mojiretsu(v, out));
  return out;
}

export function tenkenAll(obj) {
  return mojiretsu(obj).flatMap((s) => tenken(s));
}

export function soudanSaki() {
  return seihon()['相談先の案内（結果に関係なく全員に同じ文）'];
}

// Claude に持たせる決まり（正本から作る。言葉をコードに書き写さない）
export function kimariForClaude() {
  const s = seihon();
  const sakeru = s['避ける言葉'].map((w) => `- 「${w['言葉']}」→ ${w['寄せる言葉']}`).join('\n');
  const kakikata = s['書き方の決まり'].map((k) => `- ${k}`).join('\n');
  return `## 書き方の決まり\n${kakikata}\n\n## 避ける言葉（1つでも出たら書き直し）\n${sakeru}`;
}
