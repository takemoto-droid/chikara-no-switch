// 難しさの段階の選び方を、合成データで比べる（7便）。実在の子どもではない。
// ゲームと同じしくみ（yobiNext・dankaiWoSusumeru・matome）で、合成の子に HR のゲームを1回させる。
// 前提（仮の値）：段階2の問いの難しさは scripts/gousei.mjs と同じ。段階1は、どの問いも 1.2 やさしくした。
// 合成の子の力は、平均 0・ばらつき 1.3（力の低い子もふくめるため、gousei.mjs より広くした）。
// 使い方：node scripts/dankai_kurabe.mjs [--kaku]（--kaku で docs/段階の比べ_7便.md に書く）
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/kotoba.mjs';
import { stepsOf, yobiNext, dankaiWoSusumeru, matome, makeJunban, DANKAI_KIJUN, KUMI } from '../public/js/kurabe.js';

const tana = JSON.parse(readFileSync(path.join(ROOT, 'public/data/tana.json'), 'utf8'));
const N = 3000;
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const B_SHURUI = { 本文どおり: -1.2, 無関係: -0.6, 言い換え: 0.4, 一語変え: 0.7 };
const YASASHIKU = 1.2;
const p = (x) => 1 / (1 + Math.exp(-x));
function itemsOf(st) {
  const L = st.dankai ?? 2;
  const sa = L === 1 ? YASASHIKU : 0;
  if (st.kind === 'B') return (L === 1 ? [0.0] : [0.0, 0.6]).map((b) => b - sa);
  if (st.kind === 'C') return (L === 1 ? [-0.6, -0.2, 0.2] : [-0.6, -0.2, 0.2, 0.6]).map((b) => b - sa);
  return tana.A.文章[st.mondai].問い.map((q) => B_SHURUI[q.種類] - sa);
}

function hr(rnd, theta, kouka) {
  const r = { junban: makeJunban(String(rnd())), kekka: {} };
  for (let i = 0; i < 60; i++) {
    const id = yobiNext(r);
    if (!id) break;
    const st = stepsOf(r).find((x) => x.id === id);
    if (st.kind === 'D') { r.kekka[id] = { kotae: '今は答えない' }; continue; }
    const it = itemsOf(st);
    r.kekka[id] = { seikai: it.reduce((s, b) => s + (rnd() < p(theta + (kouka[st.mode] || 0) - b) ? 1 : 0), 0), kazu: it.length };
    dankaiWoSusumeru(r);
  }
  return r;
}

const SEN = [
  { mei: '段階を使わない（いつも段階2）', yasashime: -1, kirikae: false },
  { mei: '練習 2/8 以下で段階1', yasashime: 2 / 8, kirikae: true },
  { mei: '練習 3/8 以下で段階1（いまの線）', yasashime: 3 / 8, kirikae: true },
  { mei: '練習 4/8 以下で段階1', yasashime: 4 / 8, kirikae: true },
  { mei: '練習 3/8 以下で段階1・組の途中の切りかえなし', yasashime: 3 / 8, kirikae: false },
];
const MOTO = { ...DANKAI_KIJUN };
const w = (x) => `${(x * 100).toFixed(1)}%`;
const MODE = { A: 'kiku', B: 'zu', C: 'kugiri' };

const out = ['# 段階の比べ（7便・難しさの段階）', '', `> 合成データ（実在の子どもではない）。各${N.toLocaleString()}人。ゲームと同じしくみで HR を1回。段階1は、どの問いも仮に 1.2 やさしくした。合成の子の力は平均0・ばらつき1.3（力の低い子もふくめる）。`, ''];
out.push('- **ちょうどよい割合**：比べた問題（最後の段階の2組）の正答率が5〜8割に入った割合（3つの棚の平均）。06 の「正答率5〜8割になる段階を選ぶ」の確かめ。');
out.push('- **力の低い子でちょうどよい**：力の仮の値が -1.3 以下の合成の子だけで見た、ちょうどよい割合。');
out.push('- **決めつけなかった**：差が無い合成の子で、1回のゲームのどの棚にも「その日の候補」が出なかった割合。');
out.push('- **挙げられた**：差がある合成の子（その出し方なら正解しやすくなるように作った子）で、その棚の「その日の候補」になった割合（3つの棚の平均）。', '');
out.push('| 選び方 | 段階1で比べた子 | ちょうどよい割合 | 力の低い子でちょうどよい | 決めつけなかった | 挙げられた |', '|---|---|---|---|---|---|');
for (const sen of SEN) {
  DANKAI_KIJUN.yasashime = sen.yasashime;
  DANKAI_KIJUN.hobo0 = sen.kirikae ? MOTO.hobo0 : -1;
  DANKAI_KIJUN.zenbu = sen.kirikae ? MOTO.zenbu : 2;
  const rnd = mulberry32(777);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let ichi = 0; let choudo = 0; let hikuiN = 0; let hikuiChoudo = 0; let kimetsukenai = 0; let ageta = 0;
  for (let i = 0; i < N; i++) {
    const theta = 1.3 * normal();
    const r = hr(rnd, theta, {});
    const ms = ['A', 'B', 'C'].map((k) => matome(r, k));
    if (ms[0].dankai === 1) ichi++;
    const c = ms.map((m) => {
      const [m1, m2] = m.kumi;
      const all = [...m[m1], ...m[m2]];
      const ritsu = all.reduce((a, b) => a + b, 0) / (all.length * m.kazu);
      return ritsu >= 0.5 && ritsu <= 0.8 ? 1 : 0;
    }).reduce((a, b) => a + b, 0) / 3;
    choudo += c;
    if (theta <= -1.3) { hikuiN++; hikuiChoudo += c; }
    if (ms.every((m) => m.kekka === 'nashi' || m.kekka === 'mada')) kimetsukenai++;
    const r2 = hr(rnd, theta, { kiku: 1, zu: 1, kugiri: 1 });
    ageta += ['A', 'B', 'C'].filter((k) => matome(r2, k).kekka === MODE[k]).length / 3;
  }
  out.push(`| ${sen.mei} | ${w(ichi / N)} | ${w(choudo / N)} | ${w(hikuiChoudo / Math.max(1, hikuiN))}（${hikuiN}人） | ${w(kimetsukenai / N)} | ${w(ageta / N)} |`);
}
Object.assign(DANKAI_KIJUN, MOTO);
out.push('', '## 選んだ線と、そのわけ', '');
out.push('- **練習（読む／聞く 2つ・8問）の正解が 3/8 以下なら段階1から。1組目が「ほぼ0（1/8 以下）」なら段階1へ、段階1で「全部正解」なら段階2へ、次の組から変える（変える前の組は練習扱い）。**');
out.push('- 段階を使うと、ちょうどよい割合が 4割ほどから5割ほどに、力の低い合成の子では ほぼ0 から 4人に1人ほどに上がる。その代わり、決めつけなかった割合は 2ポイントほど下がる（上の表）。4/8 にしても、ちょうどよい割合はほとんど変わらず、段階1で比べる子が半分になる。2/8 では、力の低い子でちょうどよい割合が少し下がる。');
out.push('- 組の途中の切りかえは、表ではちょうどよい割合をほとんど変えない。それでも入れたのは、06 の決まり（ほぼ0・ほぼ全部正解の組は比べにくい）に合わせ、正解がほとんど無いまま比べることを避けるため。');
out.push('- 段階3（むずかしめ）は Should で、まだ作っていない。9割以上できる子は、段階2のまま比べる（「比べにくかった」と先生に出ることがある）。');
const text = out.join('\n');
console.log(text);
if (process.argv.includes('--kaku')) writeFileSync(path.join(ROOT, 'docs', '段階の比べ_7便.md'), `${text}\n`);
void KUMI;
