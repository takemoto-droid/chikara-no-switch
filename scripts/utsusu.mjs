// docs/ の文書のうち、画面から開くものを public/ に写す（Vercel は public/ だけを出すため）
// 使い方：npm run utsusu（docs/ の文書を直したら、走らせる。npm test で同じかを確かめる）
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/kotoba.mjs';

export const UTSUSU = [['docs/子どもの安全とプライバシー.md', 'public/anzen.md']];
for (const [from, to] of UTSUSU) {
  copyFileSync(path.join(ROOT, from), path.join(ROOT, to));
  console.log(`写した：${from} → ${to}`);
}
