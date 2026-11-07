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

// 子どもの画面の短い相談先（12便・下書き）。結果に関係なく、全員に同じ文
export function soudanSakiKo() {
  return seihon()['相談先の案内（子どもの画面・短い文・結果に関係なく全員に同じ文）'];
}

// 大人が自分で試すときの相談先（7便・下書き）
export function soudanSakiOtona() {
  return seihon()['相談先の案内（大人が試すとき・結果に関係なく同じ文）'];
}

// 37便：画面に出さない制作側の言葉（正本の一覧）。形（正規表現）があるものは形で探す。
// kode：コードの文字列を見るとき（ファイル名・フォルダ名の形は、読み込みの道すじと区別できないので当てない）
function seisakuNoKatachi(w) {
  return new RegExp(w['形'] || w['言葉'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
}
export function seisakuNoKotoba(text, { kode = false } = {}) {
  const t = String(text);
  const hits = [];
  for (const w of seihon()['画面に出さない制作側の言葉'] || []) {
    if (kode && w['コードの文字列には当てない']) continue;
    for (const m of t.matchAll(seisakuNoKatachi(w))) hits.push({ 言葉: w['言葉'], 寄せる言葉: w['寄せる言葉'], 位置: m.index, 長さ: m[0].length, 見つけた文字: m[0] });
  }
  return hits;
}
export function seisakuNoKotobaAll(obj) {
  return mojiretsu(obj).flatMap((s) => seisakuNoKotoba(s));
}

// Claude に持たせる決まり（正本から作る。言葉をコードに書き写さない）
export function kimariForClaude() {
  const s = seihon();
  const sakeru = s['避ける言葉'].map((w) => `- 「${w['言葉']}」→ ${w['寄せる言葉']}`).join('\n');
  const kakikata = s['書き方の決まり'].map((k) => `- ${k}`).join('\n');
  const seisaku = (s['画面に出さない制作側の言葉'] || []).map((w) => `- 「${w['言葉']}」→ ${w['寄せる言葉']}`).join('\n');
  const heii = 'AI に不慣れな先生や年配の先生、保護者が、一度読んで分かる言葉で書く。数の説明に専門の言葉を使わない（例：「たまたまの違いより大きい違い」「〜のときのほうが多く合っていた」と言う）。';
  return `## 書き方の決まり\n${kakikata}\n- ${heii}\n\n## 避ける言葉（1つでも出たら書き直し）\n${sakeru}\n\n## 画面に出さない作り手の言葉（1つでも出たら書き直し）\n${seisaku}`;
}
