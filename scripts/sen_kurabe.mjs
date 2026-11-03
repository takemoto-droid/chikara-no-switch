// 線（候補・くり返しの決まり）をいくつか並べて、合成データで比べる（6便・X1 の線の扱い）
// 合成データ。実在の子どもではない。前提（力・難しさ・慣れ）は scripts/gousei.mjs と同じ仮の値。
// X2 の骨（測る問題は固定・練習は数えない・順は入れ替える・同じ出し方2回の揺れより大きい差が同じ向きに続いたら候補・
// 素点は回ごとに比べない）は、どの線でも変えない。変えるのは「揺れ」の取り方と、別の日の「同じ向き」の数え方だけ。
// 使い方：node scripts/sen_kurabe.mjs [--kaku]（--kaku で docs/線の比べ_6便.md に書く）
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/kotoba.mjs';
import { makeSteps, KUMI } from '../public/js/kurabe.js';

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
// scripts/gousei.mjs と同じ仮の値
const B_SHURUI = { 本文どおり: -1.2, 無関係: -0.6, 言い換え: 0.4, 一語変え: 0.7 };
const B_BAMEN = [0.0, 0.6];
const B_SHIJI = [-0.6, -0.2, 0.2, 0.6];
const THETA = { heikin: 0.5, bure: 1.0 };
const NARE = 0.3;
const p = (x) => 1 / (1 + Math.exp(-x));
const itemsOf = (st) => (st.kind === 'B' ? B_BAMEN : st.kind === 'C' ? B_SHIJI : tana.A.文章[st.mondai].問い.map((q) => B_SHURUI[q.種類]));

// 同じ合成の子たちを、どの線でも使う（乱数の種を固定して、子と答えを先に作っておく）
function kodomoWoTsukuru(kouka, kaisu, tane) {
  const rnd = mulberry32(tane);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const kids = [];
  for (let i = 0; i < N; i++) {
    const theta = THETA.heikin + THETA.bure * normal();
    const kai = [];
    for (let k = 0; k < kaisu; k++) {
      const junban = {
        A: { saisho: rnd() < 0.5 ? 'yomu' : 'kiku', irekae: rnd() < 0.5 },
        B: { saisho: rnd() < 0.5 ? 'bun' : 'zu', irekae: rnd() < 0.5 },
        C: { saisho: rnd() < 0.5 ? 'ikki' : 'kugiri', irekae: rnd() < 0.5 },
      };
      const kekka = {};
      for (const st of makeSteps(junban)) {
        if (st.kind === 'D') continue;
        kekka[st.id] = { seikai: itemsOf(st).reduce((s, b) => s + (rnd() < p(theta + NARE * k + (kouka[st.mode] || 0) - b) ? 1 : 0), 0) };
      }
      kai.push({ junban, kekka, hi: `2026-0${k + 7}-01` });
    }
    kids.push(kai);
  }
  return kids;
}

// その回の中のまとめ（線ごとに揺れの取り方を変える）
function sono(rec, kind, sen) {
  const [m1, m2] = KUMI[kind];
  const steps = makeSteps(rec.junban).filter((s) => s.kind === kind && !s.renshu);
  const v = { [m1]: [], [m2]: [] };
  for (const st of steps) v[st.mode].push(rec.kekka[st.id].seikai);
  const get = (id) => steps.find((s) => s.id === id);
  const sa = [[`${kind}-1`, `${kind}-2`], [`${kind}-3`, `${kind}-4`]].map(([a, b]) => {
    const A = rec.kekka[a].seikai;
    const B = rec.kekka[b].seikai;
    return get(a).mode === m2 ? A - B : B - A;
  });
  const y1 = Math.abs(v[m1][0] - v[m1][1]);
  const y2 = Math.abs(v[m2][0] - v[m2][1]);
  const yure = sen.yure === 'max' ? Math.max(y1, y2) : sen.yure === 'heikin' ? (y1 + y2) / 2 : Math.min(y1, y2);
  const onaji = sa[0] !== 0 && Math.sign(sa[0]) === Math.sign(sa[1]);
  const muki = onaji ? (sa[0] > 0 ? m2 : m1) : null;
  const ookii = onaji && Math.min(Math.abs(sa[0]), Math.abs(sa[1])) > yure; // 骨：揺れより大きい差が、同じ向きに2組
  // 別の日の「同じ向き」の数え方：both＝2組とも同じ向き（5便）／goukei＝2組の合計の向き（片方が 0 でもよい、反対向きの組が無い）
  let sasae = muki;
  if (sen.sasae === 'goukei' && !muki) {
    const nonzero = sa.filter((d) => d !== 0);
    if (nonzero.length && nonzero.every((d) => Math.sign(d) === Math.sign(nonzero[0]))) sasae = nonzero[0] > 0 ? m2 : m1;
  }
  return { muki, ookii, sasae };
}

function kurikaeshi(kai, kind, sen) {
  const mado = sen.mado ? kai.slice(-sen.mado) : kai; // いちばん新しい○日分だけを見る
  const rows = mado.map((r) => ({ ...sono(r, kind, sen), hi: r.hi }));
  for (const d of KUMI[kind]) {
    const kouho = rows.filter((r) => r.ookii && r.muki === d).length;
    const hi = new Set(rows.filter((r) => r.sasae === d).map((r) => r.hi)).size;
    const hantai = sen.hantai === 'kouho'
      ? rows.filter((r) => r.ookii && r.muki && r.muki !== d).length
      : rows.filter((r) => r.sasae && r.sasae !== d).length;
    const zenHi = new Set(rows.map((r) => r.hi)).size;
    const hitsuyou = sen.kahansuu ? Math.max(2, Math.floor(zenHi / 2) + 1) : 2; // 過半数：比べた日の半分より多い
    if (kouho >= 1 && hi >= hitsuyou && hantai === 0) return d;
  }
  return null;
}

const SEN = [
  { mei: '5便の線', yure: 'max', sasae: 'both', hantai: 'kouho', setsumei: '揺れは2つの出し方の大きいほう。別の日は2組とも同じ向き。反対向きの「その回の候補」が無い' },
  { mei: '線1 揺れを平均に', yure: 'heikin', sasae: 'both', hantai: 'kouho', setsumei: '揺れを、2つの出し方の揺れの平均にする（ほかは5便と同じ）' },
  { mei: '線2 揺れを小さいほうに', yure: 'min', sasae: 'both', hantai: 'kouho', setsumei: '揺れを、2つの出し方の揺れの小さいほうにする（ほかは5便と同じ）' },
  { mei: '線3 別の日は合計の向き', yure: 'max', sasae: 'goukei', hantai: 'kouho', setsumei: '別の日の「同じ向き」を、2組の差の合計の向き（片方が 0 でもよい・反対向きの組が無い）で数える' },
  { mei: '線4 線1＋線3', yure: 'heikin', sasae: 'goukei', hantai: 'kouho', setsumei: '揺れを平均にし、別の日は合計の向きで数える' },
  { mei: '線5 反対向きをきびしく', yure: 'heikin', sasae: 'goukei', hantai: 'muki', setsumei: '線4 に加えて、反対向きの日が1日でもあれば、くり返しにしない' },
  { mei: '線6 揺れを平均に・反対向きの日は数えない', yure: 'heikin', sasae: 'both', hantai: 'muki', setsumei: '線1 に加えて、反対向きの日（2組とも反対向き）が1日でもあれば、くり返しにしない' },
  { mei: '線7 揺れを小さいほうに・反対向きの日は数えない', yure: 'min', sasae: 'both', hantai: 'muki', setsumei: '線2 に加えて、反対向きの日が1日でもあれば、くり返しにしない' },
  { mei: '線8 5便の線・反対向きの日は数えない', yure: 'max', sasae: 'both', hantai: 'muki', setsumei: '5便の線に加えて、反対向きの日が1日でもあれば、くり返しにしない' },
  { mei: '線9 揺れを平均に・同じ向きの日が過半数', yure: 'heikin', sasae: 'both', hantai: 'kouho', kahansuu: true, setsumei: '線1 に加えて、同じ向きの日が、比べた日の半分より多いとき（3日なら2日以上、8日なら5日以上）' },
  { mei: '線10 線9・反対向きの日は数えない', yure: 'heikin', sasae: 'both', hantai: 'muki', kahansuu: true, setsumei: '線9 に加えて、反対向きの日が1日でもあれば、くり返しにしない' },
  { mei: '線11 線6・新しい3日分まで', yure: 'heikin', sasae: 'both', hantai: 'muki', mado: 3, setsumei: '線6 に加えて、くり返しを見るのは、いちばん新しい3日分まで（月1回なら1学期ほど）' },
  { mei: '線12 線6・新しい4日分まで', yure: 'heikin', sasae: 'both', hantai: 'muki', mado: 4, setsumei: '線6 に加えて、くり返しを見るのは、いちばん新しい4日分まで' },
];

const KOUKA = [
  { mei: '差がある子（5便の設定：ふだん10問中6問 → その出し方なら8問近く）', d: 1.0 },
  { mei: '差がある子（はっきりした差：正答率5割 → 8割。06 の「5〜8割」の幅いっぱい）', d: 1.4 },
];
const MODE = { A: 'kiku', B: 'zu', C: 'kugiri' };

const out = [];
out.push('# 線の比べ（6便・X1 の線の扱い）', '');
out.push('> 合成データ（実在の子どもではない）。各3,000人・別々の日に3回。前提の仮の値は scripts/gousei.mjs と同じ。乱数の種を固定し、どの線も同じ合成の子たちで比べた。', '');
out.push('- **決めつけなかった割合**：差が無い合成の子で、どの棚にも「くり返し出た候補」が出なかった割合（高いほど決めつけにくい）。');
out.push('- **挙げられた割合**：差がある合成の子で、効くように作った出し方を、その棚の「くり返し出た候補」として挙げた割合（聞く・図で見る・区切って読む の3通りの子の平均）。', '');

const nullKids = kodomoWoTsukuru({}, 3, 20261104);
const kouKids = KOUKA.map((k) => ['A', 'B', 'C'].map((kind) => kodomoWoTsukuru({ [MODE[kind]]: k.d }, 3, 20261105 + Math.round(k.d * 10) + kind.charCodeAt(0))));

const kekka = [];
for (const sen of SEN) {
  let kimetsukenai = 0;
  for (const kai of nullKids) if (['A', 'B', 'C'].every((kind) => !kurikaeshi(kai, kind, sen))) kimetsukenai++;
  let ichinichi = 0;
  for (const kai of nullKids) if (['A', 'B', 'C'].some((kind) => sono(kai[0], kind, sen).ookii)) ichinichi++;
  const ageta = KOUKA.map((k, ki) => {
    const per = ['A', 'B', 'C'].map((kind, j) => kouKids[ki][j].filter((kai) => kurikaeshi(kai, kind, sen) === MODE[kind]).length / N);
    return { heikin: per.reduce((a, b) => a + b, 0) / 3, per };
  });
  kekka.push({ sen, kimetsukenai: kimetsukenai / N, ichinichi: ichinichi / N, ageta });
}
const w = (x) => `${(x * 100).toFixed(1)}%`;
out.push('- **1日の空ぶり**：差が無い合成の子の1日目のゲームで、どれかの棚に「その日の候補」が出た割合（低いほどよい。「この日の」カードが根拠の弱いまま渡る割合）。', '');
out.push('| 線 | 中身 | 決めつけなかった割合（3日分） | 1日の空ぶり | 挙げられた割合（5便の設定） | 挙げられた割合（はっきりした差） |', '|---|---|---|---|---|---|');
for (const r of kekka) out.push(`| ${r.sen.mei} | ${r.sen.setsumei} | ${w(r.kimetsukenai)} | ${w(r.ichinichi)} | ${w(r.ageta[0].heikin)}（聞く ${w(r.ageta[0].per[0])}・図 ${w(r.ageta[0].per[1])}・区切って ${w(r.ageta[0].per[2])}） | ${w(r.ageta[1].heikin)}（聞く ${w(r.ageta[1].per[0])}・図 ${w(r.ageta[1].per[1])}・区切って ${w(r.ageta[1].per[2])}） |`);
// 日の数を増やしたとき（月1回で1学期なら3〜4日、1年なら8〜10日）
out.push('', '## ゲームをした日の数を増やしたとき（5便の設定の差がある子）', '');
out.push('| 線 | 日の数 | 決めつけなかった割合 | 挙げられた割合 |', '|---|---|---|---|');
for (const sen of [SEN[0], SEN.find((x) => x.mei.startsWith('線6')), SEN.find((x) => x.mei.startsWith('線9')), SEN.find((x) => x.mei.startsWith('線11')), SEN.find((x) => x.mei.startsWith('線12'))]) {
  for (const kaisu of [2, 3, 5, 8]) {
    const nk = kodomoWoTsukuru({}, kaisu, 30000 + kaisu);
    const nashi = nk.filter((kai) => ['A', 'B', 'C'].every((kind) => !kurikaeshi(kai, kind, sen))).length / N;
    const ari = ['A', 'B', 'C'].map((kind) => kodomoWoTsukuru({ [MODE[kind]]: 1.0 }, kaisu, 40000 + kaisu * 7 + kind.charCodeAt(0)).filter((kai) => kurikaeshi(kai, kind, sen) === MODE[kind]).length / N);
    out.push(`| ${sen.mei} | ${kaisu}日 | ${w(nashi)} | ${w(ari.reduce((a, b) => a + b, 0) / 3)} |`);
  }
}
out.push('', '- 日の数の表は、合成データの「慣れ」の仮の値（1日ごとに、どの出し方も一律 +0.3）に強く引っぱられる。8日分では正解がほぼ満点に近づき、差が出にくくなる。長く続けたときの決まりは、人で試してから決める。');

out.push('', '## 選んだ線と、そのわけ（6便）', '');
out.push('**5便の線のまま、変えない。** 実装した線の表（README・合成データでの確かめ）も、5便の線の数字のまま。');
out.push('');
out.push('- X2 の骨（揺れより大きい差が同じ向きに2組で候補・素点は回ごとに比べない など）の中で試せた線では、差がある子を挙げられる割合は、いちばんよい線（線6・線7）でも 1.4 倍ほど（3日分で 10% → 15% ほど）にしか上がらなかった。');
out.push('- その代わりに、1日のゲームで差が無い子に「その日の候補」が出る割合が、どれか1つの棚で 2割ほどから 3割台に増えた。「この日の」カードが、根拠の弱いまま渡りやすくなる。');
out.push('- 別の日の「同じ向き」をゆるく数える線（線3・線4）は、挙げられる割合は上がるが、決めつけなかった割合が 6〜7割まで下がる。');
out.push('- 挙げられる割合をはっきり上げるには、骨の外のことが要る：1組の問いの数を増やす（今は4問、図は2問。06 の3章の棚の形に触れる）か、ゲームをする日を増やして、長く続けたときの数え方（たとえば「新しい3日分まで」）を人で試して決めること。どちらも先生が決めること。');
out.push('- 問いの数を増やす効き目は、合成データで1つだけ確かめた：図の棚の問いを1場面2問から4問にすると（5便の線のまま・3日分）、図で見るで差がある子を挙げられる割合が 6.9% → 14.6%、決めつけなかった割合は 91.4% → 89.2%（問題を足したときの別の試し。この表には入れていない）。');
out.push('- **案（先生が決める）**：(1) 5便の線のまま（いまの形）。(2) 線6 にする（挙げられる割合 1.4 倍ほど・1日の空ぶりが 2割ほどから 3割台に増える）。(3) 図の棚の問いを1場面2問から4問に増やす（問題を足す。時間が延びる）。(4) 長く続けるときは「新しい3日分まで」を見る（線11。人で試してから）。');

const text = out.join('\n');
console.log(text);
console.log('\nJSON:' + JSON.stringify(kekka.map((r) => ({ mei: r.sen.mei, kimetsukenai: r.kimetsukenai, ageta: r.ageta.map((a) => a.heikin) }))));
if (process.argv.includes('--kaku')) writeFileSync(path.join(ROOT, 'docs', '線の比べ_6便.md'), `${text}\n`);
