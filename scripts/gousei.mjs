// 合成データでの確かめ（実在の子どものデータではない）
// 1. 正答率：合成の子が、5〜8割の正答率になるか
// 2. 「候補」の決まり：本当は差が無いのに「候補」になる割合（空ぶり）と、本当に差があるときに「候補」になる割合
//
// 大事な前提（ここが変われば結果も変わる）
// - 合成の子の力 θ と、問いの難しさ b は、制作の Claude が置いた仮の値。実際の問題の難しさは、大人や子どもで試すまで分からない。
// - 正解の確からしさは 1 / (1 + exp(-(θ + 出し方の効き目 - b)))（ラッシュモデル）で決める。
// 使い方：node scripts/gousei.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/kotoba.mjs';
import { matome, erabuCard, makeSteps } from '../public/js/kurabe.js';

const tana = JSON.parse(readFileSync(path.join(ROOT, 'public/data/tana.json'), 'utf8'));
const N = 10000;

// 再現できる乱数
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261103);
const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());

// 仮の難しさ（問いの種類ごと）
const B_SHURUI = { 本文どおり: -1.2, 無関係: -0.6, 言い換え: 0.4, 一語変え: 0.7 };
const B_BAMEN = [0.0, 0.6]; // 図の問い：代金の式／代金が分かったときの式
const B_SHIJI = [-0.8, 0.0, 0.4, 0.8]; // 一気に／区切って：手順1〜4のあとの並び（あとの手順ほど難しいと仮に置く）
const THETA = { heikin: 0.5, bure: 1.0 };

const p = (x) => 1 / (1 + Math.exp(-x));
function toku(theta, items, kouka) {
  return items.reduce((s, b) => s + (rnd() < p(theta + kouka - b) ? 1 : 0), 0);
}
function itemsOf(st) {
  if (st.kind === 'B') return B_BAMEN;
  if (st.kind === 'C') return B_SHIJI;
  return tana.A.文章[st.mondai].問い.map((q) => B_SHURUI[q.種類]);
}

// 1人の合成の子に、ゲームを1回させる。kouka：出し方ごとの効き目（ロジット）
function gameWoSuru(theta, kouka) {
  const junban = {
    A: { saisho: rnd() < 0.5 ? 'yomu' : 'kiku', irekae: rnd() < 0.5 },
    B: { saisho: rnd() < 0.5 ? 'bun' : 'zu', irekae: rnd() < 0.5 },
    C: { saisho: rnd() < 0.5 ? 'ikki' : 'kugiri', irekae: rnd() < 0.5 },
  };
  const kekka = {};
  for (const st of makeSteps(junban)) {
    if (st.kind === 'D') continue;
    const items = itemsOf(st);
    kekka[st.id] = { seikai: toku(theta, items, kouka[st.mode] || 0), kazu: items.length };
  }
  return { junban, kekka };
}

function wariai(x) {
  return `${(x * 100).toFixed(1)}%`;
}

// 1. 正答率
const seitou = { A: [], B: [], C: [] };
for (let i = 0; i < N; i++) {
  const theta = THETA.heikin + THETA.bure * normal();
  const r = gameWoSuru(theta, {});
  for (const k of ['A', 'B', 'C']) {
    const ids = Object.keys(r.kekka).filter((id) => id.startsWith(`${k}-`) && !id.startsWith('A-r'));
    const s = ids.reduce((a, id) => a + r.kekka[id].seikai, 0);
    const n = ids.reduce((a, id) => a + r.kekka[id].kazu, 0);
    seitou[k].push(s / n);
  }
}
const out = ['# 合成データでの確かめ（実在の子どもではない）', '', `合成の子 ${N} 人。乱数の種 20261103。前提は scripts/gousei.mjs の先頭に書いた仮の値。`, ''];
out.push('## 1. 正答率（練習を除く）', '', '| 棚 | 合成の子の平均 | 5〜8割に入った子 | 9割以上の子 | 4割以下の子 |', '|---|---|---|---|---|');
const TANA = { A: '読む／聞く', B: '文で見る／図で見る', C: '一気に／区切って' };
for (const k of ['A', 'B', 'C']) {
  const a = seitou[k];
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  out.push(`| ${TANA[k]} | ${wariai(m)} | ${wariai(a.filter((x) => x >= 0.5 && x <= 0.8).length / a.length)} | ${wariai(a.filter((x) => x >= 0.9).length / a.length)} | ${wariai(a.filter((x) => x <= 0.4).length / a.length)} |`);
}

// 2. 「候補」の決まり
function kouhoNoWariai(kouka) {
  const c = { A: 0, B: 0, C: 0, dore: 0, dore3: 0 };
  for (let i = 0; i < N; i++) {
    const theta = THETA.heikin + THETA.bure * normal();
    const r = gameWoSuru(theta, kouka);
    let aru = false;
    for (const k of ['A', 'B', 'C']) {
      const m = matome(r, k);
      if (m.kekka !== 'nashi' && m.kekka !== 'mada') { c[k]++; aru = true; }
    }
    if (aru) c.dore3++;
    if (erabuCard(r) === 'dore') c.dore++;
  }
  return c;
}
out.push('', '## 2. 「候補」の決まりのふるまい', '');
out.push('「候補」は、同じ出し方を2回やったときの揺れより大きい差が、同じ向きに2回出たときだけ。', '');
out.push('| 合成の子の設定 | 読む／聞く で候補 | 文で見る／図で見る で候補 | 一気に／区切って で候補 | どれか1つの棚で候補 |', '|---|---|---|---|---|');
const nashi = kouhoNoWariai({});
out.push(`| どの出し方でも力が同じ（本当は差が無い） | ${wariai(nashi.A / N)} | ${wariai(nashi.B / N)} | ${wariai(nashi.C / N)} | ${wariai(nashi.dore3 / N)} |`);
for (const d of [0.5, 1.0, 1.5]) {
  const ari = kouhoNoWariai({ kiku: d, zu: d, kugiri: d });
  out.push(`| 聞く・図・区切ってが効く（効き目 ${d}） | ${wariai(ari.A / N)} | ${wariai(ari.B / N)} | ${wariai(ari.C / N)} | ${wariai(ari.dore3 / N)} |`);
}
out.push('', '- 1行目は「空ぶり」（本当は差が無いのに候補になる割合。向きはどちらでも数えた）。棚1つでは1割未満だが、3つの棚のどれかでは2割ほどになる。カードと仮説を「この日の」結果として書くのは、このため。');
out.push('- 2行目からは、本当に差がある合成の子で、候補になる割合。1回のゲームでは見のがしも多い。だから「1回では決めない」「別の日にもう一度」が要る。');
out.push('- 効き目 1.0 は、正答率がおよそ6割の子なら8割近くまで上がるくらいの差（仮の値）。');
out.push('', '## 読み方の注意', '', '- これは合成データです。問題の本当の難しさは、まだ分かりません。大人や子どもで試して、難しさの仮の値を置きかえる必要があります。', '- 子どもで確かめた結果ではありません。効果を示すものでもありません。');

const text = out.join('\n');
console.log(text);
if (process.argv.includes('--kaku')) {
  mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs', '合成データでの確かめ.md'), `${text}\n`);
}
