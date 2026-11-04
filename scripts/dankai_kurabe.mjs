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
// 段階1の棚 B の問い（8便 K2）：7便は「代金の式」の問い1つ。8便で「代金が分かったときの式」（段階2と同じ形・少し難しい +0.3）を足した
let B1_TOI = [0.0, 0.3];
function itemsOf(st) {
  const L = st.dankai ?? 2;
  const sa = L === 1 ? YASASHIKU : 0;
  if (st.kind === 'B') return (L === 1 ? B1_TOI : [0.0, 0.6]).map((b) => b - sa);
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
const KEKKA = []; // SEN と同じ順
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
  KEKKA.push({ ichi: ichi / N, choudo: choudo / N, hikui: hikuiChoudo / Math.max(1, hikuiN), kime: kimetsukenai / N, age: ageta / N });
}
Object.assign(DANKAI_KIJUN, MOTO);

// ---- 8便 K2：段階1の棚 B の直し方を比べる
// 段階1の B は、7便では問い1つ×2組（1つの出し方あたり2問）だった。4択なので、当てずっぽうでも差が付く。
// (a) 問いを2つにする／(b) 段階1の B だけ、2組の差の合計が一定以上のときだけ候補にする（問い1つのままだと差の合計は2が最大）
function bNoKekka(r, kijun) {
  const m = matome(r, 'B');
  if (kijun && m.dankai === 1 && m.kekka !== 'nashi' && m.kekka !== 'mada' && Math.abs(m.sa[0] + m.sa[1]) < kijun) return 'nashi';
  return m.kekka;
}
const NAOSHI = [
  { mei: '7便のまま（問い1つ）', toi: [0.0], kijun: null },
  { mei: '(a) 問いを2つにする（足す問いは段階2と同じ形の「代金が分かったときの式」）', toi: [0.0, 0.3], kijun: null },
  { mei: '(a) の別案：足す問いを「ひとつの値を読み取る」やさしい問いにする', toi: [0.0, -0.6], kijun: null },
  { mei: '(b) 問い1つのまま、差の合計3以上', toi: [0.0], kijun: 3 },
  { mei: '(a)＋(b) 問い2つ、差の合計3以上', toi: [0.0, 0.3], kijun: 3 },
];
const N2 = 6000;
out.push('', '## 段階1の棚 B の直し方（8便 K2）', '');
out.push(`> 合成データ（実在の子どもではない）。各${N2.toLocaleString()}人、力の仮の値は平均 -1.3・ばらつき 0.8（段階1で比べる子が多くなるように）。HR を1回。`);
out.push('> 「B が段階1」：棚 B を段階1で比べた子だけで数えた。差がある子は「図で見る」で正解しやすくなるように作った子（他の棚には差なし）。', '');
out.push('| 直し方 | B が段階1だった子 | 決めつけなかった（差が無い子・B） | 決めつけなかった（差が無い子・3つの棚ぜんぶ） | 挙げられた（図で差がある子・B） |', '|---|---|---|---|---|');
const k2 = [];
for (const n of NAOSHI) {
  B1_TOI = n.toi;
  const rnd = mulberry32(2024);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let bIchi = 0; let bOK = 0; let zenOK = 0; let zenN = 0; let zuN = 0; let zuAge = 0;
  for (let i = 0; i < N2; i++) {
    const theta = -1.3 + 0.8 * normal();
    const r = hr(rnd, theta, {});
    zenN++;
    const kB = bNoKekka(r, n.kijun);
    const kekkaZen = [matome(r, 'A').kekka, kB, matome(r, 'C').kekka];
    if (kekkaZen.every((x) => x === 'nashi' || x === 'mada')) zenOK++;
    if (matome(r, 'B').dankai === 1) {
      bIchi++;
      if (kB === 'nashi' || kB === 'mada') bOK++;
    }
    const r2 = hr(rnd, theta, { zu: 1 });
    if (matome(r2, 'B').dankai === 1) {
      zuN++;
      if (bNoKekka(r2, n.kijun) === 'zu') zuAge++;
    }
  }
  k2.push({ ...n, bOK: bOK / bIchi, zenOK: zenOK / zenN, age: zuAge / zuN });
  out.push(`| ${n.mei} | ${w(bIchi / N2)} | ${w(bOK / bIchi)} | ${w(zenOK / zenN)} | ${w(zuAge / zuN)} |`);
}
B1_TOI = [0.0, 0.3];
out.push('', '- **選んだ直し方：(a) 問いを2つにする（段階2と同じ形の「代金が分かったときの式」を足した）。**');
out.push('- (a) にすると、差が無い子に B で候補が出ることが減り、「決めつけなかった」は上がる（B だけでも、3つの棚ぜんぶでも）。問い1つのときに挙げられた割合が高く見えたのは、差1問・揺れ0問で候補になるゆるさのためで、差が無い子の空ぶりも同じだけ多かった。');
out.push('- (b) は、問い1つのままでは差の合計が2までしか出ないので、候補がまったく出なくなる。(a)＋(b) も、ほとんど出なくなる。棚 B を比べる意味が無くなるので選ばなかった。');
out.push('- 足す問いを「ひとつの値を読み取る」問いにする案は、数字は似ているが、文でも図でも書いてある数を拾うだけで答えられ、文と図の比べに情報をほとんど足さないので選ばなかった。');
out.push(`- 挙げられた割合は、(a) で ${w(k2[1].age)}（7便のまま ${w(k2[0].age)}）。1回のゲームで見つけにくいのは段階2と同じで、くり返し（別の日の同じ向き）で確かめる。`);

// 7便の表（段階1の B が問い1つのとき）は、記録として残す（8便で問いを2つにしたので、上の表の数字は変わった）
const HYOU_7BIN = ["| 選び方 | 段階1で比べた子 | ちょうどよい割合 | 力の低い子でちょうどよい | 決めつけなかった | 挙げられた |", "|---|---|---|---|---|---|", "| 段階を使わない（いつも段階2） | 0.0% | 38.6% | 0.9%（456人） | 78.8% | 10.0% |", "| 練習 2/8 以下で段階1 | 27.3% | 48.6% | 23.6%（498人） | 78.2% | 11.1% |", "| 練習 3/8 以下で段階1（いまの線） | 36.6% | 51.9% | 26.8%（467人） | 76.5% | 11.5% |", "| 練習 4/8 以下で段階1 | 49.6% | 51.7% | 27.4%（486人） | 76.3% | 10.8% |", "| 練習 3/8 以下で段階1・組の途中の切りかえなし | 38.6% | 50.5% | 29.5%（482人） | 79.1% | 10.1% |"];
out.push('', '## 7便のときの表（段階1の B が問い1つ・記録として残す）', '', ...HYOU_7BIN);

out.push('', '> 12便で、棚 B の中身を「x 個買って代金の式」から生活の場面（教室の席・校舎の案内図・時間割・棚）に差し替えた。問いの数（1つの場面に2つ）と段階の作りは同じなので、合成データは測り直していない（この文書の「代金の式」は、8便のときの問いの名前）。');
out.push('', '## 選んだ線と、そのわけ', '');
out.push('- **練習（読む／聞く 2つ・8問）の正解が 3/8 以下なら段階1から。1組目が「ほぼ0（1/8 以下）」なら段階1へ、段階1で「全部正解」なら段階2へ、次の組から変える（変える前の組は練習扱い）。**');
const [tsukawanai, , ima, yon, kirikaeNashi] = KEKKA;
const pt = (a, b) => `${((a - b) * 100).toFixed(1)}ポイント`;
out.push(`- 段階を使うと、ちょうどよい割合が ${w(tsukawanai.choudo)} から ${w(ima.choudo)} に、力の低い合成の子では ${w(tsukawanai.hikui)} から ${w(ima.hikui)} に上がる。その代わり、決めつけなかった割合は ${pt(tsukawanai.kime, ima.kime)} 下がる（${w(tsukawanai.kime)} → ${w(ima.kime)}）。4/8 にすると、ちょうどよい割合はほとんど変わらず（${w(yon.choudo)}）、決めつけなかった割合がさらに下がる（${w(yon.kime)}）。2/8 は 3/8 とほとんど同じだが、ちょうどよい割合が少し低い。`);
out.push(`- 組の途中の切りかえは、ちょうどよい割合を ${w(kirikaeNashi.choudo)} から ${w(ima.choudo)} にする。それでも入れたのは、06 の決まり（ほぼ0・ほぼ全部正解の組は比べにくい）に合わせ、正解がほとんど無いまま比べることを避けるため。`);
out.push(`- **切りかえの損（8便 K5）：組の途中の切りかえを入れると、差が無い子を決めつけなかった割合が ${w(kirikaeNashi.kime)}（切りかえなし）から ${w(ima.kime)}（いまの線）に、${pt(kirikaeNashi.kime, ima.kime)} 下がる。** わけは、はっきりとは確かめていない（切りかえた子は、新しい問題の組で比べなおすので、そのぶん空ぶりが出る機会がある、と考えている）。7便の表（段階1の B が問い1つのとき）では 79.1% → 76.5% だった。`);
out.push('- 段階3（むずかしめ）は Should で、まだ作っていない。9割以上できる子は、段階2のまま比べる（「比べにくかった」と先生に出ることがある）。');
const text = out.join('\n');
console.log(text);
if (process.argv.includes('--kaku')) writeFileSync(path.join(ROOT, 'docs', '段階の比べ_7便.md'), `${text}\n`);
void KUMI;
