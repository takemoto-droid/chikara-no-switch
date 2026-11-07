// 3分の動画を作る（24便で作り、25便・26便・27便で直した）。台本は資料の「23 動画の台本」第6版。
// 声の文・字幕・字幕・小（注意書き）・画面の順・間・字幕と札の値は、すべて台本のとおり。声の文は言い換えない。
// 使い方：npm run douga:tsukuru
// 要るもの：Playwright と Chromium・ffmpeg・pyopenjtalk の入った Python（DOUGA_PYTHON。既定は python3）・字体 BIZ UDPGothic
// 先生の声：DOUGA_KOE_DIR=<フォルダ> に 01_ki・02_sho・03_tenA・04_tenB・05_tenC・06_fukasa・07_ketsu（m4a／mp3／wav）を置くと、
//           その区間だけ合成の声の代わりに使う（無い区間は合成の声）。3:00 を超えたら止める（落とす順は台本 §2。先生が決める）。
// 次を選んだ理由の記録：DOUGA_KIROKU（既定は資料 31）。
// できるもの：.douga/チカラのスイッチ_3分.mp4 と、区間ごとの真ん中のコマ（.douga/naka/）。.douga は Git に入れない。
// 鍵は使わない（CHIKARA_KEY_NASHI=1）。画面はアプリの本物の写し（起・承・結の教室の絵だけ、この道具で描く）。
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT, tenken } from '../lib/kotoba.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SAGYOU = path.join(ROOT, '.douga');
const GAZOU = path.join(SAGYOU, 'gazou');
const KOMA = path.join(SAGYOU, 'koma');
const KOE = path.join(SAGYOU, 'koe');
const NAKA = path.join(SAGYOU, 'naka');
const DEKIAGARI = path.join(SAGYOU, 'チカラのスイッチ_3分.mp4');
const PY = process.env.DOUGA_PYTHON || 'python3';
const KOE_DIR = process.env.DOUGA_KOE_DIR || '';
const KIROKU = process.env.DOUGA_KIROKU || path.join(ROOT, '..', 'chikara-no-switch-shiryo', '31_その場3_次を選んだ理由の記録_公開デモ_20261106.json');

const FPS = 30;
const ATAMA = 0.5; // 区間の頭の間（秒）
const AIDA = 0.28; // 文と文の間（秒）
const KANAME_MA = 0.4; // 要点の文の後ろに足す間（秒）
const SAIGO = 4; // 最後の一枚（秒）
const NAGASA_MAX = 180; // 3:00
const DSF = 2.5; // 画面写しの倍率（27便 Y2：760×428 の画面を 2.5 倍で写す＝1900×1070）
const HABA = { w: 760, h: 428 }; // 27便 Y2：撮る幅は一律 760（アプリの本物の折り返し）。1280 幅で写す画面は無い
const HIROI = { w: 960, h: 540 }; // 例外：図＋2×2（測る問題）と、先生の画面のデモ1（まとめ｜仮説の 2 列）だけ 960 幅
const SEMAI = { w: 480, h: 600 }; // 28便：2-up に入れる切り出し（読む・聞く・区切って・深さ-3 のカード）は、アプリの本物の折り返しの 480 幅から写す（900×700 の箱で字を 36px 以上にするため）
const SAMPLE = 48000;
const KIRI_MIN = 2.5; // 寄りの最短の秒（台本 §2-2）
const KIRI_MOJI = 44; // 寄りの中の字の大きさの目安（px）

// ---- 台本 第6版 §1（7区間・28文）。kaname：後ろに +0.4 秒の間を足す要点の文（0 から数える）
const DAIHON = [
  { id: 'ki', koe: '01_ki', na: '起', waku: '#0E0F12', kaname: [2],
    // 27便 Y1：起の字幕・小は 2 行に（投げ文 34 の文のまま）
    chuui: ['15 歳：レベル2に届かない 18.6%（PISA 2025・国立教育政策研究所）／大人：レベル1以下 10%（PIAAC 2023・OECD）', '約 20 万人・35 人に 6〜7 人は推定・単純計算'],
    bun: [
      '国際学力調査、ピザの結果です。文章を読んで、理解して、使うこと。そこに難しさを抱える十五歳は、百人に十九人。',
      '日本では、およそ二十万人。教室なら、三十五人のうち、六人か七人です。',
      '大人になっても、十人に一人います。',
    ] },
  { id: 'sho', koe: '02_sho', na: '承', waku: '#1E2228', kaname: [5], jimakuNashi: true, chuui: [],
    bun: [
      '私は中学校の教員です。',
      '解けているのに、ノートは白紙の子がいます。',
      '読むのが遅くて、置いていかれる。読んだのに、意味が入ってこない。',
      '本人も、周りの大人も気づかず、サボっていると思われてしまう。',
      '困ったら言ってね、では届きません。でも、こちらから具体的にたずねると、答えてくれます。',
      'こちらからたずねる。それを、クラス全員に、ホームルームの時間で。それが、チカラのスイッチです。',
    ] },
  { id: 'tenA', koe: '03_tenA', na: '転A', waku: '#3A2E1A', kukan: '① 見つける', kaname: [3],
    chuui: ['合計・順位・枚数は出しません。差が出なかった子にもカードが届きます。'],
    bun: [
      '同じ問題を、出し方だけ変えて解きます。読むか、聞くか。文か、図か。一気にか、区切ってか。',
      '四十五分で、二十二問。途中に、本人が選んで答える質問も。',
      '比べる相手は、ほかの子ではなく、別の出し方で解いた自分です。',
      '聞いて考えたら、できた。その事実が、スイッチカードになって、本人に残ります。',
      '自分の出し方を知っている子は、学習でも日常でも、自分で工夫できます。声に出して読む。分からないときは、聞き返す。',
      '困りを言葉にできなくても、カードが、その子の言葉になります。',
    ] },
  { id: 'tenB', koe: '04_tenB', na: '転B', waku: '#1A3448', kukan: 'Claude が下書き', kaname: [],
    chuui: ['仮説は参考程度。決めるのは先生です。', '医療や専門の検査の代わりではありません。その手前を受け持ちます。', '保護者にも同じカードの言葉で伝えます。'],
    bun: [
      '先生の画面には、比べた結果と、本人が選んだ答えが並び、クロードが仮説と、懇談の下書きを書きます。決めるのは先生です。',
      '大事な連絡は、口でも伝える。授業の小さな工夫が、根拠つきで始まります。',
      'クラス全員がやるから、特別な子への特別なことではなく、どの子にもある、ちょっとした工夫になります。',
      '一人一人に支援が行き渡る、そのきっかけになるアプリです。',
    ] },
  { id: 'tenC', koe: '05_tenC', na: '転C', waku: '#352848', kukan: '② 育てる', kaname: [], chuui: [],
    bun: [
      '見つけたら、育てます。',
      '得意な出し方を支えにして、もう一方を、朝の十分で練習します。',
      '今日は、聞きながら読む。明日は、支えを少し減らして、もう一度。できた、を自分で積んでいきます。',
    ] },
  { id: 'fukasa', koe: '06_fukasa', na: 'Claude と深さ', waku: '#1A3F28', kukan: 'Claude がすること', kaname: [0, 2],
    chuui: ['出力は、避ける言葉で機械的に点検し、引っかかれば書き直させます。', '架空の子のデータで確かめました。'],
    bun: [
      'クロードには、測る問題を作らせません。問題を変えると、何の差なのか分からなくなるからです。',
      'クロードがするのは、次の出し方を理由つきで選ぶこと。本人の答えを読み合わせ、次の一手につなげることです。',
      'よく気づく先生にしか見えなかったことが、本人にも、周りにも見える。クロードは、そのきっかけを作ります。',
      'いちばん難しかったのは、一回で決めつけない線を引くこと。十二通りを比べ、最初の線のままにしました。',
    ] },
  { id: 'ketsu', koe: '07_ketsu', na: '結', waku: '#1E2228', kaname: [1],
    chuui: ['学校ごとの設定で、次の年にも引き継げます。', '学力への効果は確かめていません。言えるのは、ゲームの中で、支えが少なくてもできた、という事実までです。'],
    bun: [
      'ホームルームと朝の時間だけで、クラス全員が使えます。調べものから設計まで、クロードと作りました。',
      '言葉にできなくても、力のスイッチを、見つけて育てる。',
    ] },
];
const OTOSU_JUN = '転C-2 → 転A-2 → 起-3';

// 合成の声に渡すときだけ読みを直す（文は変えない）。既定の辞書だと「言って」を「ゲンッテ」、「区切って」を「クギリッテ」と読むため
const YOMI_NAOSHI = [['言ってね', 'いってね'], ['区切って', 'くぎって']];
// 字幕：「クロード」は「Claude」、かな数字（漢数字）は算用数字。起-1 は「国際学力調査 PISA の結果です。」、転B-2 は『 』付き（批評の表）。
// 読点で切った「かけら」ごとに直す（字幕の枚数は、かけらを 22 字までまとめて決める）
const JIMAKU_KAE = [
  ['国際学力調査、', '国際学力調査 '], ['ピザの', 'PISA の'], ['大事な連絡は、', '『大事な連絡は、'], ['口でも伝える。', '口でも伝える』。'],
  ['クロード', 'Claude'], ['十五歳', '15 歳'], ['百人に十九人', '100 人に 19 人'], ['二十万人', '20 万人'], ['三十五人', '35 人'],
  ['六人か七人', '6 人か 7 人'], ['十人に一人', '10 人に 1 人'], ['四十五分', '45 分'], ['二十二問', '22 問'], ['朝の十分', '朝の 10 分'],
  ['一回で', '1 回で'], ['十二通り', '12 通り'],
];
const yomiOf = (s) => YOMI_NAOSHI.reduce((a, [x, y]) => a.replaceAll(x, y), s);
const jimakuOf = (s) => JIMAKU_KAE.reduce((a, [x, y]) => a.replaceAll(x, y), s)
  .replace(/Claude(?=[^\s、。』])/g, 'Claude ').replace(/([^\s\x20-\x7e、。「『])(?=[0-9])/g, '$1 ');
const kakeraOf = (s) => s.split(/(?<=[、。])/).filter(Boolean);

// 画面に重ねる文（札・小さい注・絵の文・最後の一枚）。字幕と同じく言葉の正本で点検する
const KASANE = {
  fuda: { ko: '子どもの画面', sensei: '先生の画面' },
  kakuu: 'この動画の子は、架空の子です',
  hayaokuri: '早送り',
  kirokuNoHi: '2026-11-06 に公開デモで Claude が書いた記録',
  ki: { ue: 'PISA 2025　国際学力調査', hito: ['100 人に', '人'], kyoushitsu: ['35 人に', '6〜7 人', 'およそ 20 万人'] },
  sho: ['解けているのに、ノートは白紙。', '読むのが遅くて、置いていかれる。', 'サボっている、と思われてしまう。', '『困ったら言ってね』では届かない。', 'こちらからたずねると、答えてくれる。'],
  yomu: '📖 読む', kiku: '👂 聞く', kikuSoe: '左と同じ文章を、声で',
  zu: '🗺️ 図で見る', kugiri: '✂️ 一文ずつ読む',
  sodateMae: '8 回目の練習のあと', sodateAto: '12 回目の練習のあと',
  kimatta: 'Claude を使わないとき', claude: 'Claude の下書き',
  senDai: '線の比べ（docs/線の比べ_6便.md）',
  saigo: ['チカラのスイッチ', '言葉にできなくても、力のスイッチを見つけて育てる', 'github.com/takemoto-droid/chikara-no-switch', 'Built with Claude Code'],
  // 声 “Mei” は CC BY 3.0。docs/権利と出典.md の決まり（動画にも同じ表示を入れる）で、最後の一枚の下に小さく出す
  // 27便 Y3〜Y5：寄りの上の札・転A-5 の工夫の札・深さ-3 の 2 枚の見出し
  kakinaosu: '先生が書き直す',
  kufuu: ['声に出して読む', '分からないときは 聞き返す'],
  mieru: ['先生に見える', '本人に見える'],
  nerai: 'ねらい', sasae: 'きょうの支え',
  koeHyouji: 'ナレーションの音声：Open JTalk で作成。声 “Mei” © 2009-2013 Nagoya Institute of Technology（CC BY 3.0）',
};

// ---- 字幕の枚数（1 行 22 字まで・原則 1 行。かけらを前から 22 字までまとめる。1 つのかけらが 22 字を超えるときだけ 2 行）
const MAX = 22;
const haba = (s) => [...s].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);
function nigyou(s) {
  // 22 字を超えるかけらを 2 行にする（釣り合いのよい所で切る。ASCII の語の中では切らない）
  let best = null;
  for (let i = 1; i < s.length; i++) {
    if (/[\x21-\x7e]/.test(s[i - 1]) && /[\x21-\x7e]/.test(s[i])) continue;
    const a = s.slice(0, i), b = s.slice(i);
    if (haba(a) > MAX || haba(b) > MAX) continue;
    const sa = Math.abs(haba(a) - haba(b));
    if (!best || sa < best.sa) best = { sa, g: [a.trim(), b.trim()] };
  }
  if (!best) throw new Error(`字幕が 3 行になります：${s}`);
  return best.g;
}
export function jimakuNoMai(kakera) {
  // kakera：字幕の文のかけら（読点・句点まで）の並び → [{ k: [かけらの番号], gyou: [行] }]
  // 「。」までをひとつの文とみて、文の途中で枚をまたがない。短い文は 22 字までなら同じ枚にまとめる。
  // 22 字を超える文は、読点の所で、枚数がいちばん少なく、いちばん釣り合う割り方にする
  const bunNi = [];
  let b = [];
  kakera.forEach((t, i) => { b.push(i); if (/。$/.test(t) || i === kakera.length - 1) { bunNi.push(b); b = []; } });
  const txt = (ks) => ks.map((i) => kakera[i]).join('').trim();
  const mai = [];
  let cur = null;
  const dasu = () => { if (cur) mai.push(cur); cur = null; };
  for (const ks of bunNi) {
    if (haba(txt(ks)) <= MAX) {
      if (cur && haba(txt([...cur, ...ks])) <= MAX) cur = [...cur, ...ks];
      else { dasu(); cur = ks; }
      continue;
    }
    dasu();
    let best = null;
    for (let m = 0; m < 1 << (ks.length - 1); m++) {
      const parts = [[ks[0]]];
      for (let j = 1; j < ks.length; j++) { if (m & (1 << (j - 1))) parts.push([ks[j]]); else parts[parts.length - 1].push(ks[j]); }
      const ws = parts.map((x) => haba(txt(x)));
      const over = ws.filter((w) => w > MAX).length;
      const score = [over, parts.length, Math.max(...ws) - Math.min(...ws)];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { score, parts };
    }
    best.parts.forEach((x) => mai.push(x));
  }
  dasu();
  return mai.map((ks) => ({ k: ks, gyou: haba(txt(ks)) <= MAX ? [txt(ks)] : nigyou(txt(ks)) }));
}

// ---- 1. 声（合成の声。先生の声のファイルがある区間は、それを使う）
function koeWoTsukuru() {
  mkdirSync(KOE, { recursive: true });
  const bun = DAIHON.flatMap((sec) => sec.bun.map((b, i) => ({ key: `${sec.id}_${i + 1}`, yomi: yomiOf(b), bubun: kakeraOf(yomiOf(b)) })));
  const src = path.join(KOE, 'bun.json');
  writeFileSync(src, JSON.stringify(bun, null, 1));
  const r = spawnSync(PY, [path.join(ROOT, 'scripts', 'douga_koe.py'), src, KOE], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`声を作れませんでした（${PY}）。pyopenjtalk を入れてください：python3 -m venv .onsei-env && .onsei-env/bin/pip install pyopenjtalk → DOUGA_PYTHON=.onsei-env/bin/python`);
  return { nagasa: JSON.parse(readFileSync(path.join(KOE, 'nagasa.json'), 'utf8')), bubun: JSON.parse(readFileSync(path.join(KOE, 'bubun.json'), 'utf8')) };
}

// 先生の声（DOUGA_KOE_DIR）：区間ごとのファイルを 48kHz・モノラルの wav にする
function senseiNoKoe() {
  const out = {};
  if (!KOE_DIR) return out;
  if (!existsSync(KOE_DIR)) throw new Error(`DOUGA_KOE_DIR が見つかりません：${KOE_DIR}`);
  const files = readdirSync(KOE_DIR);
  for (const sec of DAIHON) {
    const f = files.find((x) => new RegExp(`^${sec.koe}\\.(m4a|mp3|wav)$`, 'i').test(x));
    if (!f) continue;
    const wav = path.join(KOE, `sensei_${sec.id}.wav`);
    ff(['-i', path.join(KOE_DIR, f), '-ac', '1', '-ar', String(SAMPLE), '-c:a', 'pcm_s16le', wav]);
    out[sec.id] = { file: wav, moto: f };
  }
  return out;
}

function wavNoNakami(file) {
  const b = readFileSync(file);
  let i = 12;
  let fmt = null;
  while (i < b.length) {
    const id = b.toString('ascii', i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(i + 10), sr: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === 'data') {
      if (!fmt || fmt.ch !== 1 || fmt.sr !== SAMPLE || fmt.bits !== 16) throw new Error(`声の形が違います：${file}`);
      return new Int16Array(b.buffer.slice(b.byteOffset + i + 8, b.byteOffset + i + 8 + Math.min(size, b.length - i - 8)));
    }
    i += 8 + size + (size & 1);
  }
  throw new Error(`声のファイルが読めません：${file}`);
}

function wavWoKaku(file, samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE, 24); h.writeUInt32LE(SAMPLE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

// ---- 2. 画面を写す
const KINSHI = ['予備の動き', 'Vercel', 'vercel', 'API キー', 'APIキー', 'sk-ant'];

async function gamenWoUtsusu() {
  mkdirSync(GAZOU, { recursive: true });
  const PORT = 8796;
  const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), CHIKARA_KEY_NASHI: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const BASE = `http://localhost:${PORT}/?shiken=1`;
  const browser = await chromium.launch();
  const G = {};
  // 27便 Y2：撮る画面は 760×428（例外だけ 960×540）。倍率は 2.5
  const atarashii = async (o = HABA) => {
    const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: DSF });
    return ctx.newPage();
  };

  // ページの中の道具：要素の四角（ページの座標）・文字の四角・見えてはいけない言葉・入力欄の中の文字の四角
  const yoi = (page) => page.evaluate(() => {
    const pr = (b) => ({ x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height });
    window.__shikaku = (el) => pr(el.getBoundingClientRect());
    window.__moji = (el, sub) => {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let all = '';
      while (tw.nextNode()) { nodes.push([tw.currentNode, all.length]); all += tw.currentNode.textContent; }
      const at = all.indexOf(sub);
      if (at < 0) return [];
      const pos = (k) => { const [n, o] = nodes.filter(([, o2]) => o2 <= k).pop(); return [n, k - o]; };
      const r = document.createRange();
      r.setStart(...pos(at));
      r.setEnd(...pos(at + sub.length - 1)); r.setEnd(r.endContainer, r.endOffset + 1);
      return [...r.getClientRects()].filter((b) => b.width > 1).map(pr);
    };
    // 入力欄（textarea）の中の文字：同じ字体・幅の見えない写しを作って位置を測る（写しはすぐ消す）
    window.__taMoji = (t, sub) => {
      const cs = getComputedStyle(t);
      const d = document.createElement('div');
      for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'boxSizing', 'width', 'wordBreak', 'overflowWrap', 'textAlign']) d.style[k] = cs[k];
      Object.assign(d.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', left: '0', top: '0' });
      const v = t.value, i = v.indexOf(sub);
      if (i < 0) return [];
      d.textContent = v.slice(0, i);
      const s = document.createElement('span');
      s.textContent = sub;
      d.appendChild(s);
      d.appendChild(document.createTextNode(v.slice(i + sub.length)));
      document.body.appendChild(d);
      const dr = d.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const rs = [...s.getClientRects()].map((x) => ({ x: tr.left + scrollX + x.left - dr.left, y: tr.top + scrollY + x.top - dr.top - t.scrollTop, width: x.width, height: x.height }));
      d.remove();
      return rs;
    };
    window.__kinshi = (clip, words) => {
      const out = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) {
        const n = tw.currentNode;
        const w = words.find((x) => n.textContent.includes(x));
        if (!w) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) {
          const x = b.left + scrollX, y = b.top + scrollY;
          if (b.width && b.height && x < clip.x + clip.width && x + b.width > clip.x && y < clip.y + clip.height && y + b.height > clip.y) { out.push(w); break; }
        }
      }
      return out;
    };
  });
  const union = (rs) => {
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
  };
  // 写して、印（枠・下線・タップ）の位置を画像の座標で残す。marks：{ 名前: [ページの四角] }。moji：寄りの中のおもな字の大きさ（CSS の px）
  const shashin = async (page, name, clip, marks = {}, o = {}) => {
    await yoi(page);
    const kin = await page.evaluate(([c, w]) => window.__kinshi(c, w), [clip, KINSHI]);
    if (kin.length) throw new Error(`${name} に映してはいけない表示があります：${kin.join('・')}`);
    const file = path.join(GAZOU, `${name}.png`);
    await page.screenshot({ path: file, clip, fullPage: true, caret: o.caret || 'hide' });
    const m = {};
    for (const [k, rs] of Object.entries(marks)) m[k] = rs.map((r) => ({ x: (r.x - clip.x) * DSF, y: (r.y - clip.y) * DSF, w: r.width * DSF, h: r.height * DSF }));
    G[name] = { file, w: Math.round(clip.width * DSF), h: Math.round(clip.height * DSF), marks: m, moji: o.moji || null };
  };
  const zen = async (page, name, marks = {}) => {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const v = page.viewportSize();
    if (v.width > HIROI.w) throw new Error(`${name}：${v.width} 幅で写そうとしました（27便：1280 幅で写す画面は無い）`);
    await shashin(page, name, { x: s.x, y: s.y, width: v.width, height: v.height }, marks);
  };
  // pad：まわりの余白（数か { ue, shita, yoko }）。上下は、となりの札や行がはみ出して映らないよう小さくできる
  const clipOf = async (page, rect, pad = 14) => {
    const pd = typeof pad === 'number' ? { ue: pad, shita: pad, yoko: pad } : { ue: 14, shita: 14, yoko: 14, ...pad };
    const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    const x = Math.max(0, rect.x - pd.yoko), y = Math.max(0, rect.y - pd.ue);
    return { x, y, width: Math.min(doc.w - x, rect.x - x + rect.width + pd.yoko), height: Math.min(doc.h - y, rect.y - y + rect.height + pd.shita) };
  };
  const kiru = async (page, name, rect, marks = {}, pad = 14, o = {}) => {
    await page.waitForTimeout(300);
    await shashin(page, name, await clipOf(page, rect, pad), marks, o);
  };
  const shikaku = async (page, sel) => { await yoi(page); return page.locator(sel).first().evaluate((el) => window.__shikaku(el)); };
  const mojiNoOokisa = async (page, sel) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const moji = async (page, sel, sub) => {
    await yoi(page);
    const rs = await page.locator(sel).first().evaluate((el, s) => window.__moji(el, s), sub);
    if (!rs.length) throw new Error(`画面に「${sub}」が見つかりません（${sel}）`);
    return rs;
  };
  const vis = async (page, sel) => { const l = page.locator(sel).first(); return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled().catch(() => true)); };
  // 端末の覚え（localStorage）に、撮るときだけ架空の子を入れる（アプリのデータは触らない）
  const oboeniIreru = (page, kids) => page.evaluate((ks) => {
    const KEY = 'chikara-no-switch.v3';
    const st = { kids: {}, check: null, ai: {}, seq: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    for (const k of ks) st.kids[k.id] = k;
    st.seq = Math.max(st.seq || 0, 9);
    localStorage.setItem(KEY, JSON.stringify(st));
  }, kids);

  try {
    // ---- その場で動かす子（はじめの画面 → 案内 → ゲーム）。27便：760×428
    const page = await atarashii();
    await page.goto(`${BASE}#/`);
    await page.waitForSelector('a[href="#/annai/ko"] .box');
    await zen(page, 'home');
    // 承-6：はじめの画面の題名と 1 行目の説明
    const dai = await page.evaluate(() => { const h = document.querySelector('main h1, #app h1'); const p = h.nextElementSibling; return [window.__shikaku(h), window.__shikaku(p)]; });
    await kiru(page, 'home_dai', union(dai), {}, 16, { moji: await mojiNoOokisa(page, 'main h1, #app h1') });
    await page.click('a[href="#/annai/ko"] >> nth=0');
    await page.waitForSelector('.annai-ichibun');
    while (await vis(page, '#annai-tsugi')) await page.click('#annai-tsugi');
    await page.click('a[href="#/hajimeru"]');

    // 子どもがゲームを通す。kiriDasu：読む・聞く・図・区切っての切り取り（2-up の絵）。そうでないとき：ゲームのはじめ・「次は 👂 聞く」・選んで答える質問
    const asobu = async (page, kiriDasu) => {
      const stepNoNakami = () => page.evaluate(async () => {
        const { stepOf } = await import('/js/kurabe.js');
        const { getRecord } = await import('/js/kiroku.js');
        const el = document.querySelector('#riyuu[data-step]');
        const id = decodeURIComponent(location.hash.replace('#/game/', ''));
        const rec = await getRecord(id);
        const st = el && rec ? stepOf(rec, el.dataset.step) : null;
        return st ? { id: st.id, kind: st.kind, mode: st.mode, mondai: st.mondai, renshu: Boolean(st.renshu), ichibun: el.textContent.trim() } : null;
      });
      // 聞く版は本文が無いので、「次は 👂 聞く」と「▶ 聞く」のボタンに寄る（27便 Y5：空に見えないように）
      // 28便：読む版は本文の箱だけ（900×700 の箱で本文を 36px 以上に。上の見出しが「📖 読む」）
      const gameNoBasho = async (mode) => (mode === 'yomu' ? shikaku(page, '#mondai .honbun') : union([await shikaku(page, '#riyuu'), await shikaku(page, mode === 'kiku' ? '#mondai .btns' : '#mondai')]));
      const gameKiru = async (name, mode) => kiru(page, name, await gameNoBasho(mode), {}, mode === 'yomu' ? { ue: 6, shita: 4 } : { ue: 6 }, { moji: await mojiNoOokisa(page, mode === 'kiku' ? '#riyuu' : '#mondai .honbun, #mondai .toi, #mondai') });
      const A = { yomu: {}, kiku: {} };
      let dTsugi = false;
      const KO_MAX = 8; // 子ごとにゲームの順が入れかわるので、同じ文章の読む版と聞く版がそろうまで、架空の子を足して通す
      for (let ko = 1; ko <= KO_MAX; ko++) {
        if (ko > 1) await page.goto(`${BASE}#/hajimeru`);
        await page.waitForSelector('#riyuu');
        let mae = null;
        for (let i = 0; i < 3000; i++) {
          if (await vis(page, 'a[href^="#/card/"]')) break;
          if (await vis(page, '#riyuu[data-step]')) {
            const step = await page.locator('#riyuu[data-step]').first().getAttribute('data-step');
            if (step !== mae) {
              mae = step;
              await page.waitForTimeout(250);
              const st = await stepNoNakami();
              if (!kiriDasu && ko === 1 && !G.game_1) await zen(page, 'game_1');
              if (kiriDasu && st.kind === 'A' && !st.renshu) {
                const futsuu = !st.ichibun.includes('新しい');
                const kago = A[st.mode];
                if (!kago[st.mondai] || (futsuu && !kago[st.mondai].futsuu)) {
                  const name = `${st.mode}_${st.mondai}`;
                  await gameKiru(name, st.mode);
                  kago[st.mondai] = { name, futsuu };
                }
              }
              if (!kiriDasu && st.kind === 'A' && !st.renshu && st.mode === 'kiku' && !st.ichibun.includes('新しい') && !G.kiku_zen) {
                // 深さ-1：「次は 👂 聞く」の一文と、その下の ▶ 聞く に寄る
                const r = await shikaku(page, '#riyuu');
                const b = await shikaku(page, '#mondai .btns');
                await zen(page, 'kiku_zen');
                await kiru(page, 'kiku_ichibun', { x: r.x, y: r.y, width: Math.min(r.width, 420), height: b.y + b.height - r.y }, {}, 12, { moji: await mojiNoOokisa(page, '#riyuu') });
              }
              if (kiriDasu && (st.mode === 'zu' || st.mode === 'kugiri') && !G[st.mode] && (!st.ichibun.includes('新しい') || ko === KO_MAX)) {
                // 図＋2×2（測る問題）だけ 960×540 で写す（27便 Y2 の例外）
                if (st.mode === 'zu') {
                  // 図は 960×540 で写し、図（教室の席など）の部分だけを切る（28便：席の名前を 30px 以上にするため）
                  await page.setViewportSize({ width: HIROI.w, height: HIROI.h }); await page.waitForTimeout(400);
                  await yoi(page);
                  const zr = await page.locator('#mondai .bamen-zu').first().evaluate((el) => { const c = el.parentElement; const rs = [window.__shikaku(el)]; for (const x of c.children) if (x !== el && x.getBoundingClientRect().bottom <= el.getBoundingClientRect().top + 2) rs.push(window.__shikaku(x)); return rs; });
                  const zm = await page.locator('#mondai .bamen-zu text').first().evaluate((el) => el.getBoundingClientRect().height);
                  await kiru(page, 'zu', union(zr), {}, 10, { moji: zm });
                  await page.setViewportSize({ width: SEMAI.w, height: SEMAI.h }); await page.waitForTimeout(200);
                } else await gameKiru(st.mode, st.mode);
              }
              if (!kiriDasu && st.kind === 'D' && !dTsugi) {
                // 選んで答える質問（27便 Y2：上の 4 択まで写して止める）。3 つ目の答えをタップ
                const toi = await page.locator('#mondai').first().innerText();
                G.D_toi = toi.split('\n')[0].trim();
                await kiru(page, 'D_mae', union([await shikaku(page, '#mondai'), await shikaku(page, '.choice >> nth=3')].map((x, i) => (i === 0 ? { ...x, height: 10 } : x))),
                  { choice: [await shikaku(page, '.choice >> nth=2')] }, { ue: 10, shita: 10, yoko: 14 }, { moji: await mojiNoOokisa(page, '.choice') });
                await page.locator('.choice').nth(2).click();
                await page.waitForFunction((x) => document.querySelector('#riyuu[data-step]')?.dataset.step !== x, step);
                await page.waitForTimeout(250);
                await zen(page, 'D_ato');
                dTsugi = true;
                continue;
              }
            }
          }
          for (const sel of ['#tsuzukeru', '#next', '#play', '.marubatsu button', '.choice']) if (await vis(page, sel)) { await page.locator(sel).first().click(); break; }
          await page.waitForTimeout(30);
        }
        if (!kiriDasu && G.game_1 && G.kiku_zen && G.D_mae) return;
        if (kiriDasu) {
          const pair = Object.keys(A.yomu).filter((m) => A.kiku[m]);
          const onaji = pair.find((m) => A.yomu[m].futsuu && A.kiku[m].futsuu) || (ko >= KO_MAX - 1 ? pair[0] : null);
          if (onaji && G.zu && G.kugiri) { G.yomu = G[A.yomu[onaji].name]; G.kiku = G[A.kiku[onaji].name]; G.onajiMondai = onaji; return; }
        }
      }
      throw new Error(kiriDasu ? '読む版と聞く版で同じ文章の画面を写せませんでした' : 'ゲームのはじめ・「次は 聞く」・質問の画面を写せませんでした');
    };
    await asobu(page, false);
    await page.context().close();
    const pS = await atarashii(SEMAI);
    await pS.goto(`${BASE}#/hajimeru`);
    await asobu(pS, true);
    await pS.context().close();

    // ---- 保存した結果（架空の子・デモ1）。その場の子のいない端末で開く（保存した Claude の文が出る）
    // 全体はまとめ｜仮説の 2 列が見える 960×540（27便 Y2 の例外）。寄りは 760 幅の画面から切る
    const pW = await atarashii(HIROI);
    await pW.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
    await pW.waitForSelector('#kasetsu .label.ai');
    await zen(pW, 'sensei_d1');
    await pW.context().close();
    const p2 = await atarashii();
    await p2.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('#kasetsu .kasetsu');
    await p2.waitForSelector('#kasetsu .label.ai');
    await yoi(p2);
    const hyou = await p2.evaluate(() => {
      const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === '読む／聞く');
      let t = h.nextElementSibling;
      while (t && t.tagName !== 'TABLE' && !t.querySelector('table')) t = t.nextElementSibling;
      const tb = t.tagName === 'TABLE' ? t : t.querySelector('table');
      const th = tb.querySelectorAll('th');
      const r2 = window.__shikaku(th[1]);
      const tr = window.__shikaku(tb);
      // 左の 2 列（出し方・正解）だけ（27便 Y3：右端が切れないよう、2 列目の右の線まで）
      // 28便：右端は 2 列目の右の罫線のすぐ外（3 列目の字を枠に入れない）
      return [...window.__moji(h, h.textContent.trim()), { ...tr, x: tr.x - 14, width: r2.x + r2.width - tr.x + 14 + 3 }];
    });
    await kiru(p2, 'd1_hyou', union(hyou), {}, { ue: 14, shita: 6, yoko: 0 }, { moji: await mojiNoOokisa(p2, 'td') });
    // 転B-1「比べた結果と」：まとめの箱（見出し＋3 行の箇条書き）
    const matome = await p2.evaluate(() => { const b = document.querySelector('.narabi section.box'); return [window.__shikaku(b.querySelector('h2')), window.__shikaku(b.querySelector('ul'))]; });
    await kiru(p2, 'd1_matome', union(matome), {}, 14, { moji: await mojiNoOokisa(p2, '.narabi section.box ul li') });
    // 転B-1「本人が選んだ答えが並び」：授業の手がかりの「選んだ答え」の箇条書き（→ の 4 行）
    const tegakari = await p2.evaluate(() => { const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === '選んだ答え'); const ul = h.parentElement.querySelector('ul'); return { r: [window.__shikaku(h), window.__shikaku(ul)], n: ul.querySelectorAll('li').length, ya: [...ul.querySelectorAll('li')].every((li) => li.textContent.includes('→')) }; });
    if (tegakari.n !== 4 || !tegakari.ya) throw new Error(`選んだ答えの箇条書きが 4 行の「→」ではありません（${tegakari.n} 行）`);
    await kiru(p2, 'd1_tegakari', union(tegakari.r), {}, 14, { moji: await mojiNoOokisa(p2, 'h3 + p + ul li, section ul li') });
    const kp = await p2.evaluate(() => [...document.querySelectorAll('#kasetsu > *')].map((el) => ({ tag: el.tagName, r: window.__shikaku(el), t: el.textContent.slice(0, 20) })));
    // #kasetsu の中：0 札・1 仮説・2 次に試すなら・3 確かめた回数・4 見出し・5 理由の一覧・6 参考程度・7 保存の印
    const ul = kp.findIndex((x) => x.tag === 'UL');
    if (ul < 0 || !kp[1].t.startsWith('仮説') || !kp[3].t.startsWith('確かめた回数')) throw new Error('先生の画面の仮説の欄の形が、思っていたものと違います');
    // 転B-1「Claude が仮説と、懇談の下書きを書きます」：札（Claude が書いた下書き）・仮説・確かめた回数。仮説の 1 行と確かめた回数に枠
    await kiru(p2, 'd1_kakunin', union(kp.slice(0, 4).map((x) => x.r)), { waku: [kp[1].r, kp[3].r] }, { ue: 8, shita: 10, yoko: 14 }, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(2)') });
    // 深さ-3 の左：仮説の箱の「耳で聞いて答えるとき、力が出ているかも。」（760 幅で切り出す）
    const kasetsuMoji = await p2.locator('#kasetsu > :nth-child(2)').first().evaluate((el) => window.__moji(el, el.textContent.trim()));
    await moji(p2, '#kasetsu > :nth-child(2)', '耳で聞いて答えるとき、力が出ているかも。');
    await kiru(p2, 'd1_kasetsu', union(kasetsuMoji), {}, 16, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(2)') });
    // 深さ-2 の右：Claude の下書きの「次に試すなら」の文。「こちらから個別に声をかけて確かめる」に枠
    await kiru(p2, 'migi_tsugi', kp[2].r, { waku: await moji(p2, '#kasetsu > :nth-child(3)', 'こちらから個別に声をかけて確かめる') }, 16, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(3)') });

    await p2.goto(`${BASE}#/card/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('.switch-card');
    await zen(p2, 'card_d1');
    await kiru(p2, 'card_d1_card', await shikaku(p2, '.switch-card'), { hitokoto: await moji(p2, '.switch-card', '聞いて 考えると、力が 出せるかも'), betsu: await moji(p2, '.switch-card', '別の日は 違うかも。') }, 10, { moji: await mojiNoOokisa(p2, '.switch-card .hitokoto') });

    // 28便：深さ-3 の右のカードは 480 幅の画面から（900×700 の箱で一言を 40px 以上に）
    {
      const pc = await atarashii(SEMAI);
      await pc.goto(`${BASE}#/card/${encodeURIComponent('デモ1')}`);
      await pc.waitForSelector('.switch-card');
      await kiru(pc, 'card_d1_semai', await shikaku(pc, '.switch-card'), { hitokoto: await moji(pc, '.switch-card', '聞いて 考えると、力が 出せるかも'), betsu: await moji(pc, '.switch-card', '別の日は 違うかも。') }, 10, { moji: await mojiNoOokisa(pc, '.switch-card .hitokoto') });
      // 深さ-3 の左：仮説の 1 文も 480 幅の画面から（2 行に折り返し、字を大きく）
      await pc.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
      await pc.waitForSelector('#kasetsu .label.ai');
      await yoi(pc);
      const km = await pc.locator('#kasetsu > :nth-child(2)').first().evaluate((el) => window.__moji(el, el.textContent.trim()));
      await moji(pc, '#kasetsu > :nth-child(2)', '耳で聞いて答えるとき、力が出ているかも。');
      await kiru(pc, 'd1_kasetsu_semai', union(km), {}, 16, { moji: await mojiNoOokisa(pc, '#kasetsu > :nth-child(2)') });
      await pc.context().close();
    }

    // ⑤ 伝え方：懇談の下書きの 1 語を、先生が書きかえる（27便 Y4）。欄の中は scrollTop=0 にして、1 文目の頭の 2 行に寄る
    await p2.goto(`${BASE}#/tsutae/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('textarea');
    await p2.waitForTimeout(500);
    await zen(p2, 'tsutae_d1');
    const ta = p2.locator('textarea').first();
    const kmoji = await mojiNoOokisa(p2, 'textarea');
    await ta.evaluate((t) => { t.scrollTop = 0; });
    await yoi(p2);
    const taR = await ta.evaluate((t) => window.__shikaku(t));
    const lh = await ta.evaluate((t) => parseFloat(getComputedStyle(t).lineHeight));
    const pt = await ta.evaluate((t) => parseFloat(getComputedStyle(t).paddingTop) + parseFloat(getComputedStyle(t).borderTopWidth));
    const ichibun = await ta.evaluate((t) => t.value.split('。')[0] + '。');
    // 書きかえる語：「ご家庭で」→「おうちで」。1 文目に無いときは、1 文目の「今回」→「この日」（投げ文 34 Y4 の決まり）
    const KAE = ichibun.includes('ご家庭で') ? ['ご家庭で', 'おうちで'] : ichibun.includes('今回') ? ['今回', 'この日'] : null;
    if (!KAE) throw new Error(`懇談の下書きの 1 文目に、書きかえる語がありません：${ichibun}`);
    G.kakikae = { mae: KAE[0], ato: KAE[1], ichibun };
    // 2 行ぶんだけ（3 行目の頭が映らないよう、行の下の余白の半分で切る）
    const nigyou = { x: taR.x, y: taR.y, width: taR.width, height: pt + lh * 2 - lh * 0.12 };
    const kaeAt = await ta.evaluate((t, w) => t.value.indexOf(w), KAE[0]);
    const kaeR = async (w) => { await ta.evaluate((t) => { t.scrollTop = 0; }); await yoi(p2); return ta.evaluate((t, x) => window.__taMoji(t, x), w); };
    const maeR = await kaeR(KAE[0]);
    if (!maeR.length || maeR[0].y + maeR[0].height > nigyou.y + nigyou.height) throw new Error('書きかえる語が、欄の上の 2 行に入っていません');
    const kakiClip = await clipOf(p2, nigyou, { ue: 8, shita: 0, yoko: 10 });
    // カーソルの写った絵（点滅の向きを見て撮り分ける）
    const karetTsuki = async (name) => {
      await shashin(p2, `${name}_kesu`, kakiClip, {}, { moji: kmoji, caret: 'hide' });
      const hide = readFileSync(G[`${name}_kesu`].file);
      for (let i = 0; i < 12; i++) {
        await shashin(p2, name, kakiClip, {}, { moji: kmoji, caret: 'initial' });
        if (!readFileSync(G[name].file).equals(hide)) return;
        await p2.waitForTimeout(90);
      }
      throw new Error('カーソルの写った絵が撮れませんでした');
    };
    // before：語に灰の下線
    await shashin(p2, 'kaki_mae', kakiClip, { sen: maeR }, { moji: kmoji });
    // 選択：語を選んだ姿
    await ta.evaluate((t, [a, n]) => { t.focus(); t.setSelectionRange(a, a + n); t.scrollTop = 0; }, [kaeAt, KAE[0].length]);
    await shashin(p2, 'kaki_sentaku', kakiClip, {}, { moji: kmoji });
    // 消えて打ち直し：1 字ずつ（カーソル点滅込み）
    await p2.keyboard.press('Backspace');
    await ta.evaluate((t) => { t.scrollTop = 0; });
    await karetTsuki('kaki_k0');
    for (let i = 0; i < KAE[1].length; i++) {
      await p2.keyboard.type(KAE[1][i]);
      await ta.evaluate((t) => { t.scrollTop = 0; });
      await karetTsuki(`kaki_k${i + 1}`);
    }
    G.kakiKazu = KAE[1].length;
    // after：新しい語に橙の下線
    await ta.evaluate((t) => t.blur());
    const atoR = await kaeR(KAE[1]);
    if (!atoR.length) throw new Error('書きかえた語が見つかりません');
    await shashin(p2, 'kaki_ato', kakiClip, { sen: atoR }, { moji: kmoji });
    // 転B-2：『大事な連絡は、口でも伝える』の 1 文だけ（他の行は枠外）。「大事な説明や宿題・持ち物を口でも伝える」に下線
    const BUN = '授業では、大事な説明や宿題・持ち物を口でも伝える';
    const sen = '大事な説明や宿題・持ち物を口でも伝える';
    const bunAt = await ta.evaluate((t, x) => t.value.indexOf(x), BUN);
    if (bunAt < 0) throw new Error(`懇談の下書きに「${BUN}」がありません`);
    const bunZen = await ta.evaluate((t, a) => { const v = t.value; const e = v.indexOf('。', a); return v.slice(a, e + 1); }, bunAt);
    // その文の行が欄の上に来るまで、欄の中をスクロールしてから測る
    const r0 = await kaeR(bunZen);
    await ta.evaluate((t, dy) => { t.scrollTop = Math.max(0, dy); }, r0[0].y - taR.y - pt);
    await yoi(p2);
    const bunR = await ta.evaluate((t, x) => window.__taMoji(t, x), bunZen);
    const senR = await ta.evaluate((t, x) => window.__taMoji(t, x), sen);
    const bu = union(bunR);
    await shashin(p2, 'kon_sen', await clipOf(p2, { x: taR.x, y: bu.y, width: taR.width, height: bu.height }, { ue: 6, shita: 4, yoko: 10 }), { sen: senR }, { moji: kmoji });

    // ⑥ 育てる（朝の練習）：今日の練習・今日のやり方
    await p2.goto(`${BASE}#/sodateru/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('text=今日の練習');
    await zen(p2, 'sodateru_d1');
    const kyou = async (name, sub) => {
      const el = p2.locator(`text=${sub}`).first();
      const zenbun = await el.evaluate((x) => x.textContent.trim());
      const r = union(await el.evaluate((x, t) => window.__moji(x, t), zenbun));
      await kiru(p2, name, r, {}, { ue: 12, shita: 12, yoko: 20 }, { moji: await el.evaluate((x) => parseFloat(getComputedStyle(x).fontSize)) });
    };
    await yoi(p2);
    await kyou('kyou_renshu', '今日の練習：');
    await kyou('kyou_yarikata', '今日の やり方：');

    // 先生の画面：架空の子 8 人の一覧（全体と、「保存した結果（架空の子）」の 8 行の寄り）
    await p2.goto(`${BASE}#/sensei`);
    await p2.waitForSelector('#keikaku li');
    await zen(p2, 'sensei_top');
    await yoi(p2);
    const ichiran = await p2.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('保存した結果（架空の子）'));
      const rs = [];
      let n = h.nextElementSibling;
      const t = [];
      while (n && n.tagName === 'P' && n.querySelector('a[href^="#/sensei/ko/"]')) { rs.push(window.__shikaku(n)); t.push(n.textContent.trim()); n = n.nextElementSibling; }
      return { rs, t, moji: parseFloat(getComputedStyle(h.nextElementSibling).fontSize) };
    });
    if (ichiran.t.length !== 8 || !ichiran.t.some((x) => x.includes('差が出なかった子'))) throw new Error(`保存した結果の一覧が 8 行ではありません：${ichiran.t.join('／')}`);
    // 8 行だけ（見出しは入れない）。字の幅で切る（行は横いっぱいに広がるため）
    const ichiranMoji = await p2.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('保存した結果（架空の子）')); const out = []; let n = h.nextElementSibling; while (n && n.tagName === 'P' && n.querySelector('a[href^="#/sensei/ko/"]')) { out.push(...window.__moji(n, n.textContent.trim())); n = n.nextElementSibling; } return out; });
    await kiru(p2, 'ichiran_8', union(ichiranMoji), {}, { ue: 6, shita: 6, yoko: 14 }, { moji: ichiran.moji });
    G.ichiranGyou = ichiran.t;

    await p2.context().close();

    // ---- Claude を使わないときの決まった文（同じデモ1で「もう一度書いてもらう」。鍵が無いので決まった文が出る）
    const p3 = await atarashii();
    await p3.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
    await p3.waitForSelector('#kasetsu .label.ai');
    await p3.click('#kasetsu #again');
    await p3.waitForSelector('#kasetsu .label.yobi');
    await p3.waitForTimeout(300);
    const hidariLi = '#kasetsu li:has-text("授業で分からない")';
    await kiru(p3, 'hidari_li', await shikaku(p3, hidariLi), { waku: await moji(p3, hidariLi, 'そのままにしている') }, { ue: 4, shita: 4, yoko: 14 }, { moji: await mojiNoOokisa(p3, hidariLi) });
    await p3.context().close();

    // ---- 撮るときだけ端末の覚えに入れる架空の子：その場3（資料 31 の記録）・その場7（デモ7 の 8 回目までの練習）
    const kiroku = JSON.parse(readFileSync(KIROKU, 'utf8'));
    if (!Array.isArray(kiroku.erabi) || !kiroku.erabi.length) throw new Error(`次を選んだ理由の記録が読めません：${KIROKU}`);
    const demo = JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', 'demo.json'), 'utf8')).結果;
    const sono3 = { id: 'その場3', kai: 1, kekka: demo['デモ1'].kai[0].kekka, owari: true, erabi: kiroku.erabi, junban: kiroku.junban, hi: kiroku.hi, dankai: kiroku.dankai };
    const d7 = demo['デモ7'];
    const sono7 = { id: 'その場7', kai: [{ ...d7.kai[0], id: 'その場7', kai: 1 }], renshu: d7.renshu.slice(0, 8) };
    const mitai = kiroku.erabi.map((e) => `${e.step}：${e.riyuu} （${e.dare === 'claude' ? 'Claude' : '決まった順'}）`.replace(/\s+/g, ' '));
    // （Claude）の付いた 3 行（5〜7 行目）を、1 行ずつ写す（27便 Y3：3 行同時ではなく 1 行ずつ。行末の「（Claude）」に枠）
    const SAN = [4, 5, 6];
    if (SAN.some((i) => kiroku.erabi[i].dare !== 'claude')) throw new Error('記録の 5〜7 行目が Claude の行ではありません');
    const p5 = await atarashii();
    await p5.goto(`${BASE}#/`);
    await p5.waitForSelector('a[href="#/annai/ko"]');
    await oboeniIreru(p5, [{ id: 'その場3', kai: [sono3] }]);
    await p5.goto(`${BASE}#/sensei/ko/${encodeURIComponent('その場3')}`);
    const sum5 = p5.locator('summary', { hasText: '次を選んだ理由の記録' });
    await sum5.waitFor();
    await sum5.click();
    await p5.waitForTimeout(300);
    await yoi(p5);
    const g5 = await sum5.evaluate((x) => [...x.closest('details').querySelectorAll('li')].map((li) => ({ t: li.textContent.replace(/\s+/g, ' ').trim(), r: window.__shikaku(li) })));
    if (g5.length !== mitai.length || g5.some((g, i) => g.t !== mitai[i])) throw new Error(`記録の欄の行が、資料 31 の文と違います：\n${g5.map((g) => g.t).join('\n')}`);
    const liMoji = await p5.locator('details li').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const olR = await p5.locator('details ol').first().evaluate((el) => window.__shikaku(el));
    for (const [k, i] of SAN.entries()) {
      const sel = `details ol > li:nth-child(${i + 1})`;
      // 行の番号（「5.」）まで入れる。上下は、となりの行が映らないよう詰める
      const lr = g5[i].r;
      await kiru(p5, `kiroku_${k + 1}`, { x: olR.x, y: lr.y, width: lr.x + lr.width - olR.x, height: lr.height }, { waku: await moji(p5, sel, '（Claude）') }, { ue: 2, shita: 2, yoko: 6 }, { moji: liMoji });
    }
    await p5.context().close();
    G.kirokuGyou = { zen: g5.length, claude: kiroku.erabi.filter((e) => e.dare === 'claude').length, utsushita: SAN.map((i) => mitai[i]) };
    const sodateCard = async (pg, name) => {
      await yoi(pg);
      const r = await pg.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('育てているカード'));
        let c = h && h.nextElementSibling;
        while (c && !c.classList.contains('switch-card')) c = c.nextElementSibling;
        if (!c) return null;
        const lv = c.querySelector('.level');
        return { card: window.__shikaku(c), level: (() => { const rs = window.__moji(lv, lv.textContent.trim()); const x = Math.min(...rs.map((q) => q.x)), y = Math.min(...rs.map((q) => q.y)); return { x, y, width: Math.max(...rs.map((q) => q.x + q.width)) - x, height: Math.max(...rs.map((q) => q.y + q.height)) - y }; })(), moji: parseFloat(getComputedStyle(lv).fontSize), t: lv.textContent.trim() };
      });
      if (!r) throw new Error(`${name}：育てているカードが見つかりません`);
      await kiru(pg, name, r.card, {}, 10, { moji: await mojiNoOokisa(pg, '.switch-card .hitokoto') });
      // 転C-3：レベルの行（●の数と「育て中→一人前」）だけ
      await kiru(pg, `${name}_level`, r.level, {}, { ue: 8, shita: 8, yoko: 12 }, { moji: r.moji });
      G[`${name}_levelBun`] = r.t;
    };
    // 育てたカード（デモ7）の前後 2 枚：いま（12 回目の練習のあと）と、8 回目の練習のあと（撮るときだけ端末の覚えに入れた「その場7」）
    const p6 = await atarashii();
    await p6.goto(`${BASE}#/card/${encodeURIComponent('デモ7')}`);
    await p6.waitForSelector('.switch-card');
    await sodateCard(p6, 'sodate_ato');
    await oboeniIreru(p6, [sono7]);
    await p6.goto(`${BASE}#/card/${encodeURIComponent('その場7')}`);
    await p6.waitForSelector('.switch-card');
    await sodateCard(p6, 'sodate_mae');
    await p6.context().close();
  } finally {
    await browser.close();
    srv.kill();
  }
  return G;
}

// ---- 3. 一コマずつ組む（Playwright で 1920×1080 の HTML を写す）
// 画面の枠 P。札の行は枠の上（上端から 18px）。
// 27便 Y1：枠の下に、字幕・小の帯（暗い地・2 行まで）、その下に字幕の帯。どちらもアプリの枠に重ねない
const P = { x: 198, y: 86, w: 1524, h: 793 };
const CHUUI_UE = P.y + P.h + 6; // 字幕・小の帯の上端
const CHUUI_TAKASA = 85; // 28px・行の高さ 1.3・2 行＋上下 6px
const OBI = 1080 - 8 - 96; // 字幕の帯の上端（1 行の帯の高さ 96）
const KUMI_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:"BIZ UDPGothic","Noto Sans JP",sans-serif;}
#f{position:absolute;inset:0;background:#1E2228;}
#p{position:absolute;left:${P.x}px;top:${P.y}px;width:${P.w}px;height:${P.h}px;overflow:hidden;border-radius:6px;}
#yori{position:absolute;inset:0;pointer-events:none;}
#ue{position:absolute;left:${P.x}px;top:18px;height:58px;display:flex;align-items:center;gap:22px;}
#fuda{height:58px;line-height:58px;padding:0 22px;border-radius:12px;background:#2E6F93;color:#fff;font-size:40px;font-weight:700;}
#kukan{font-size:40px;font-weight:700;color:#F2EFE8;}
#jimaku{position:absolute;left:${P.x}px;width:${P.w}px;top:${OBI}px;height:96px;box-sizing:border-box;padding:14px 24px;background:rgba(0,0,0,.75);color:#fff;font-size:52px;line-height:1.3;font-weight:700;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.9);}
#shita{position:absolute;left:${P.x}px;width:${P.w}px;top:${P.y + P.h - 40}px;text-align:center;font-size:22px;color:#B8BDC4;}
#chuui{position:absolute;left:40px;width:1840px;top:${CHUUI_UE}px;height:${CHUUI_TAKASA}px;box-sizing:border-box;padding:6px 20px;background:rgba(20,20,20,.92);color:#D8D3C7;font-size:28px;font-weight:400;line-height:1.3;text-align:center;border-radius:6px;display:flex;flex-direction:column;justify-content:center;}
#chuui:empty{display:none;}
#chuui > div{white-space:nowrap;}
#hayaokuri{position:absolute;right:${1920 - P.x - P.w + 16}px;top:${P.y + 14}px;font-size:24px;color:#1E2228;background:#E9C46A;padding:4px 14px;border-radius:14px;font-weight:700;}
#kakuu{position:absolute;right:${1920 - P.x - P.w + 20}px;top:${P.y + P.h - 46}px;font-size:22px;color:#6B6760;}
#zenmen{position:absolute;inset:0;display:none;}
.hide{display:none!important;}
.waku-img{position:absolute;}
.waku-img img{width:100%;height:100%;display:block;}
.mk-waku{position:absolute;border:5px solid #F2A33A;border-radius:10px;}
.mk-sen{position:absolute;height:8px;background:#F2A33A;border-radius:4px;}
.fuda-k{position:absolute;font-size:44px;font-weight:700;background:#fff;color:#23262b;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.4);padding:18px 28px;white-space:nowrap;}
.mk-tap{position:absolute;width:80px;height:80px;margin:-40px 0 0 -40px;border-radius:50%;border:7px solid #F2A33A;background:rgba(242,163,58,.25);}
.label-w{color:#fff;font-weight:700;}
</style></head><body><div id="f"><div id="p"></div><div id="yori"></div><div id="ue"><div id="fuda"></div><div id="kukan"></div></div><div id="chuui"></div><div id="jimaku"></div><div id="shita"></div><div id="hayaokuri"></div><div id="kakuu"></div><div id="zenmen"></div></div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nose = (el, s) => { el.textContent = s || ''; el.classList.toggle('hide', !s); };
// 画像を box の中に置く。o.waku／o.sen／o.tap：画像の座標の四角。o.fuchi：寄りの縁の色。戻り値は倍率
function gazou(parent, g, box, o = {}) {
  const sc = Math.min(box.w / g.w, box.h / g.h, o.max || 99, o.takasa ? o.takasa / g.h : 99);
  const w = g.w * sc, h = g.h * sc;
  const d = document.createElement('div');
  d.className = 'waku-img';
  Object.assign(d.style, { left: box.x + (box.w - w) / 2 + 'px', top: (o.ueSoroe ? box.y : box.y + (box.h - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
  if (o.fuchi) Object.assign(d.style, { outline: '5px solid ' + o.fuchi, borderRadius: '8px', boxShadow: '0 14px 44px rgba(0,0,0,.6)' });
  const img = document.createElement('img');
  img.src = g.src;
  if (o.fuchi) img.style.borderRadius = '8px';
  d.appendChild(img);
  for (const r of (o.waku || [])) {
    const m = document.createElement('div'); m.className = 'mk-waku';
    if (o.wakuIro) m.style.borderColor = o.wakuIro;
    Object.assign(m.style, { left: r.x * sc - 10 + 'px', top: r.y * sc - 8 + 'px', width: r.w * sc + 20 - 10 + 'px', height: r.h * sc + 16 - 10 + 'px' });
    d.appendChild(m);
  }
  for (const r of (o.sen || [])) {
    const m = document.createElement('div'); m.className = 'mk-sen';
    if (o.senIro) m.style.background = o.senIro;
    Object.assign(m.style, { left: r.x * sc + 'px', top: (r.y + r.h) * sc - 1 + 'px', width: r.w * sc + 'px' });
    d.appendChild(m);
  }
  for (const r of (o.tap || [])) {
    const m = document.createElement('div'); m.className = 'mk-tap';
    Object.assign(m.style, { left: (r.x + r.w / 2) * sc + 'px', top: (r.y + r.h / 2) * sc + 'px' });
    d.appendChild(m);
  }
  if (o.ue) {
    const l = document.createElement('div');
    l.className = 'label-w';
    Object.assign(l.style, { position: 'absolute', left: '-200px', right: '-200px', top: '-50px', textAlign: 'center', fontSize: '28px', color: o.ueIro || '#fff' });
    l.textContent = o.ue;
    d.appendChild(l);
  }
  parent.appendChild(d);
  return img.decode().then(() => sc);
}
function fit(el, max = 1.6) {
  const w = el.scrollWidth, h = el.scrollHeight;
  const sc = Math.min(${P.w} / w, ${P.h} / h, max);
  Object.assign(el.style, { position: 'absolute', left: (${P.w} - w * sc) / 2 + 'px', top: (${P.h} - h * sc) / 2 + 'px', transform: 'scale(' + sc + ')', transformOrigin: '0 0' });
}
window.kaku = async (s) => {
  $('f').style.background = s.waku || '#1E2228';
  nose($('fuda'), s.fuda);
  nose($('kukan'), s.kukan);
  $('jimaku').innerHTML = (s.jimaku || []).map((l) => '<div>' + esc(l) + '</div>').join('');
  $('jimaku').classList.toggle('hide', !(s.jimaku || []).length);
  // 字幕・小：1 項目 1 行。3 項目以上は 2 行目に続けて並べる（2 行まで）
  const cl = s.chuui || [];
  const gyou = cl.length > 2 ? [cl[0], cl.slice(1).join('　')] : cl;
  $('chuui').innerHTML = gyou.map((l) => '<div>' + esc(l) + '</div>').join('');
  nose($('hayaokuri'), s.hayaokuri);
  nose($('shita'), s.shita);
  nose($('kakuu'), s.kakuu);
  const p = $('p'), yori = $('yori');
  p.innerHTML = ''; yori.innerHTML = '';
  p.style.background = 'transparent';
  $('zenmen').style.display = 'none';
  const e = s.pic;
  const all = { x: 0, y: 0, w: ${P.w}, h: ${P.h} };
  // 27便 Y1：字幕・小は枠の外（枠の下）なので、寄りはずらさない
  const chuuiH = 0;
  let sc = null;
  const waits = [];
  if (e.k === 'zen') waits.push(gazou(p, e.g, all, e.o));
  if (e.k === 'kiri') {
    if (e.haikeiHtml) {
      const d = document.createElement('div'); d.innerHTML = e.haikeiHtml; p.appendChild(d);
      const dim = document.createElement('div');
      Object.assign(dim.style, { position: 'absolute', inset: 0, background: 'rgba(14,15,18,.66)' });
      p.appendChild(dim);
    } else if (e.haikei) {
      waits.push(gazou(p, e.haikei, all));
      const dim = document.createElement('div');
      Object.assign(dim.style, { position: 'absolute', inset: 0, background: 'rgba(14,15,18,.66)' });
      p.appendChild(dim);
    } else p.style.background = '#3A3F47';
    const ueH = e.o && e.o.ue ? 60 : 0;
    // 28便：abs＝画面の座標で高さと中心を決める（転A のカード）。obi＝1 枚の帯の箱（x 40〜1880・y 160〜760）に contain
    const box = e.abs ? { x: e.abs.x, y: e.abs.cy - e.abs.h / 2, w: e.abs.h * e.g.w / e.g.h, h: e.abs.h }
      : e.obi ? { x: 40, y: 160 + ueH, w: 1840, h: 600 - ueH }
      : e.box ? { x: ${P.x} + e.box.x, y: ${P.y} + e.box.y + ueH, w: e.box.w, h: e.box.h - ueH }
      : e.zenhaba
      ? { x: 40, y: ${P.y} + 20 + ueH, w: 1840, h: ${P.h} - 40 - ueH - chuuiH }
      : { x: ${P.x} + 50, y: ${P.y} + 26 + ueH, w: ${P.w} - 100, h: ${P.h} - 52 - ueH - chuuiH };
    waits.push(gazou(yori, e.g, box, { ...e.o, max: e.max || 1.5, takasa: e.takasa, fuchi: e.fuchi || '#F2A33A' }).then((x) => { sc = x; }));
    // 27便 Y5：転A-5 の工夫の札（右に 2 枚まで）
    (e.fudaK || []).forEach((t, i) => {
      const f = document.createElement('div'); f.className = 'fuda-k'; f.textContent = t;
      Object.assign(f.style, { left: '1180px', top: ${P.y} + 230 + i * 150 + 'px' });
      yori.appendChild(f);
    });
  }
  if (e.k === 'narabe' && !e.mukashi) {
    // 28便：2-up は左右の箱（x 60〜960・980〜1880、y 130〜830）に contain・上揃え。見出しは 32px・箱の上端の 12px 上。添え書きは絵の下に 32px
    p.style.background = '#2A2F36';
    const BOX = [{ x: 60, y: 130, w: 900, h: 700 }, { x: 980, y: 130, w: 900, h: 700 }];
    e.items.forEach((it, i) => {
      const bx = BOX[i];
      const lb = document.createElement('div'); lb.className = 'label-w';
      Object.assign(lb.style, { position: 'absolute', left: bx.x + 'px', width: bx.w + 'px', bottom: (1080 - bx.y + 12) + 'px', textAlign: 'center', fontSize: '32px', lineHeight: '1.25' });
      lb.textContent = it.label;
      yori.appendChild(lb);
      waits.push(gazou(yori, it.g, bx, { ...it.o, fuchi: it.fuchi || null, ueSoroe: true }).then((sc) => {
        if (!it.soe) return;
        const so = document.createElement('div'); so.className = 'label-w';
        Object.assign(so.style, { position: 'absolute', left: bx.x + 'px', width: bx.w + 'px', top: bx.y + it.g.h * sc + 16 + 'px', textAlign: 'center', fontSize: '32px', fontWeight: '400', color: '#C9CDD2' });
        so.textContent = it.soe;
        yori.appendChild(so);
      }));
    });
  }
  if (e.k === 'narabe' && e.mukashi) {
    p.style.background = '#2A2F36';
    // 27便：2 枚並べは横いっぱい（1840 幅）に置いて字を大きくする（レベルの行は 27便のまま）
    const host = yori, ox = 40, oy = ${P.y}, ww = 1840;
    const n = e.items.length, gap = 28;
    const cw = (ww - gap * (n + 1)) / n;
    e.items.forEach((it, i) => {
      const x = ox + gap + i * (cw + gap);
      const lb = document.createElement('div'); lb.className = 'label-w';
      Object.assign(lb.style, { position: 'absolute', left: x + 'px', top: oy + 18 + 'px', width: cw + 'px', textAlign: 'center', fontSize: (e.labelPx || 32) + 'px', lineHeight: '1.3' });
      lb.innerHTML = esc(it.label) + (it.soe ? '<div style="font-size:24px;font-weight:400;color:#C9CDD2">' + esc(it.soe) + '</div>' : '');
      host.appendChild(lb);
      const hh = ${P.h} - 100 - 20 - chuuiH;
      waits.push(gazou(host, it.g, { x, y: oy + 100, w: cw, h: hh }, { ...it.o, fuchi: it.fuchi || null, takasa: it.takasa ? hh * it.takasa : undefined }));
    });
  }
  if (e.k === 'html') {
    p.style.background = e.pbg || '#F5F3EE';
    const d = document.createElement('div');
    d.innerHTML = e.html;
    if (e.obi) {
      // 28便：1 枚の帯の箱（x 40〜1880・y 160〜760）に contain・中央揃え
      yori.appendChild(d);
      d.style.display = 'inline-block';
      const w = d.scrollWidth, h = d.scrollHeight;
      const sc = Math.min(1840 / w, 600 / h, e.max || 99);
      Object.assign(d.style, { position: 'absolute', left: 40 + (1840 - w * sc) / 2 + 'px', top: 160 + (600 - h * sc) / 2 + 'px', transform: 'scale(' + sc + ')', transformOrigin: '0 0' });
    } else {
      p.appendChild(d);
      d.style.display = 'inline-block';
      fit(d, e.max || 1.6);
    }
  }
  if (e.k === 'zenmen') {
    const z = $('zenmen');
    z.style.display = 'block';
    z.innerHTML = e.html;
  }
  await Promise.all(waits);
  await document.fonts.ready;
  // 27便 Y1：字幕・小と字幕の帯が、アプリの枠に重なっていないか・字幕・小がはみ出していないか
  const pr = $('p').getBoundingClientRect();
  const ch = $('chuui');
  const kasanari = ch.childElementCount ? ch.getBoundingClientRect().top < pr.bottom : false;
  const hamidashi = [...ch.children].some((d) => d.scrollWidth > ch.clientWidth - 40);
  const obiKasanari = !$('jimaku').classList.contains('hide') && $('jimaku').getBoundingClientRect().top < (ch.childElementCount ? ch.getBoundingClientRect().bottom : pr.bottom);
  return { sc, kasanari, hamidashi, obiKasanari };
};
</script></body></html>`;

async function komaWoKumu(specs) {
  mkdirSync(KOMA, { recursive: true });
  const html = path.join(SAGYOU, 'kumitate.html');
  writeFileSync(html, KUMI_HTML);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  const files = new Map();
  const bairitsu = new Map();
  const keyOf = (s) => createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 16);
  try {
    for (const s of specs) {
      const key = keyOf(s);
      if (files.has(key)) continue;
      const file = path.join(KOMA, `${key}.png`);
      const kk = await page.evaluate((x) => window.kaku(x), s);
      if (kk.kasanari || kk.obiKasanari) throw new Error(`字幕・小か字幕の帯が、アプリの枠に重なりました（${key}）`);
      if (kk.hamidashi) throw new Error(`字幕・小が 1 行に入りません：${(s.chuui || []).join('／')}`);
      await page.screenshot({ path: file });
      files.set(key, file);
      bairitsu.set(key, kk.sc);
    }
  } finally {
    await browser.close();
  }
  return { fileOf: (s) => files.get(keyOf(s)), scOf: (s) => bairitsu.get(keyOf(s)) };
}

// ---- 起・承・結の絵（道具で描く SVG。枠 P の大きさ）
const W = P.w, H = P.h;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="BIZ UDPGothic, sans-serif"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;
const ORANGE = '#F2A33A', HAI = '#3A3F47';
// 100 人の点（10×10）。iro：色の付いた点の数（読む順）。kazu：右の数（null で出さない）。ue：上の「PISA 2025　国際学力調査」
function hyakuNin({ iro = 0, kazu = null, ue = true }) {
  const dots = [];
  for (let i = 0; i < 100; i++) dots.push(`<circle cx="${190 + (i % 10) * 56}" cy="${170 + Math.floor(i / 10) * 56}" r="20" fill="${i < iro ? ORANGE : HAI}"/>`);
  const u = ue ? `<text x="${W / 2}" y="86" text-anchor="middle" font-size="36" fill="#9AA0A8">${KASANE.ki.ue}</text>` : '';
  const k = kazu == null ? '' : `<text x="840" y="470" font-size="48" fill="#F4F4F2">${KASANE.ki.hito[0]} <tspan font-size="180" font-weight="700" fill="${ORANGE}">${kazu}</tspan> ${KASANE.ki.hito[1]}</text>`;
  return svg(u + dots.join('') + k, '#0E0F12');
}
// 教室（黒板 1 本・5 行×7 列＝35 席）。灯す 7 席は散らす（台本 §1）
const NANA = [[1, 2], [2, 5], [3, 1], [3, 6], [4, 3], [5, 4], [5, 7]];
const SEKI = { w: 80, h: 56, gx: 18, gy: 30 };
const KW = 7 * SEKI.w + 6 * SEKI.gx;
const sekiNoBasho = (x0, y0, r, c) => ({ x: x0 + (c - 1) * (SEKI.w + SEKI.gx), y: y0 + (r - 1) * (SEKI.h + SEKI.gy) });
function kyoushitsu({ x0, y0 = 150, tomoru = 0, cards = 0, iro = { seki: HAI, kokuban: HAI, tomo: ORANGE }, migi = false, bg = '#0E0F12' }) {
  const lit = NANA.slice(0, tomoru).map(([r, c]) => `${r}-${c}`);
  const parts = [`<rect x="${x0 + KW * 0.2}" y="${y0 - 76}" width="${KW * 0.6}" height="18" rx="4" fill="${iro.kokuban}"/>`];
  let n = 0;
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 7; c++) {
    const { x, y } = sekiNoBasho(x0, y0, r, c);
    parts.push(`<rect x="${x}" y="${y}" width="${SEKI.w}" height="${SEKI.h}" rx="8" fill="${lit.includes(`${r}-${c}`) ? iro.tomo : iro.seki}"/>`);
    // 27便 Y5：席のカードは 44×26・白・上に 4px の帯 #2f6f8f・角丸 4
    if (n < cards) parts.push(`<rect x="${x + SEKI.w / 2 - 22}" y="${y + SEKI.h / 2 - 13}" width="44" height="26" rx="4" fill="#FFFFFF"/><path d="M${x + SEKI.w / 2 - 18} ${y + SEKI.h / 2 - 13}h36a4 4 0 0 1 4 4v0h-44v0a4 4 0 0 1 4-4z" fill="#2f6f8f"/>`);
    n++;
  }
  if (migi) {
    parts.push(`<text x="900" y="330" font-size="120" font-weight="700" fill="#F4F4F2">${KASANE.ki.kyoushitsu[0]}</text>`);
    parts.push(`<text x="900" y="470" font-size="120" font-weight="700" fill="${ORANGE}">${KASANE.ki.kyoushitsu[1]}</text>`);
    parts.push(`<text x="900" y="580" font-size="64" fill="#C9CDD2">${KASANE.ki.kyoushitsu[2]}</text>`);
  }
  return svg(parts.join(''), bg);
}
// 承：起の教室の続き（明るい地）。p：1 席が残って大きくなる進み（0〜1）。gyou：出ている行の数。fade：いちばん新しい行の現れ方（0〜1）
const SHO_SEKI = [3, 6];
function shoNoE({ p = 0, gyou = 0, fade = 1 }) {
  const x0 = 110, y0 = 150;
  const iro = { seki: '#D9D3C7', kokuban: '#B9B2A4', tomo: ORANGE };
  const e = (t) => 1 - (1 - t) * (1 - t); // なめらかに
  const q = e(p);
  const parts = [`<g opacity="${(1 - q).toFixed(3)}"><rect x="${x0 + KW * 0.2}" y="${y0 - 76}" width="${KW * 0.6}" height="18" rx="4" fill="${iro.kokuban}"/>`];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 7; c++) {
    if (r === SHO_SEKI[0] && c === SHO_SEKI[1]) continue;
    const { x, y } = sekiNoBasho(x0, y0, r, c);
    const lit = NANA.some(([a, b]) => a === r && b === c);
    parts.push(`<rect x="${x}" y="${y}" width="${SEKI.w}" height="${SEKI.h}" rx="8" fill="${lit ? iro.tomo : iro.seki}"/>`);
  }
  parts.push('</g>');
  const s = sekiNoBasho(x0, y0, ...SHO_SEKI);
  const to = { x: 120, y: 340, w: SEKI.w * 3, h: SEKI.h * 3 };
  const lerp = (a, b) => a + (b - a) * q;
  parts.push(`<rect x="${lerp(s.x, to.x)}" y="${lerp(s.y, to.y)}" width="${lerp(SEKI.w, to.w)}" height="${lerp(SEKI.h, to.h)}" rx="${lerp(8, 20)}" fill="${ORANGE}"/>`);
  // 27便 Y5：文ごとに席の中の小さな絵（線画・1 色・文字なし）
  if (q >= 1 && gyou > 0) parts.push(sekiNoE(Math.min(gyou, 4), to));
  for (let i = 0; i < gyou; i++) {
    const ima = i === gyou - 1;
    const a = ima ? fade : 1;
    const y = 230 + i * 92 + (ima ? 12 * (1 - a) : 0);
    parts.push(`<text x="460" y="${y}" font-size="${ima ? 48 : 40}" font-weight="${ima ? 700 : 400}" fill="${ima ? '#23262B' : '#7A7468'}" opacity="${a.toFixed(3)}">${KASANE.sho[i]}</text>`);
  }
  return svg(parts.join(''), '#F3EFE6');
}

// 承の席の中の絵（線画・1 色 #23262B・文字なし）。1：白いノート（空欄）／2：本と時計／3：「？」の吹き出し／4：「！」の吹き出し
function sekiNoE(n, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const st = 'fill="none" stroke="#23262B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
  const fuki = `<path d="M${cx - 62} ${cy - 50}h124a14 14 0 0 1 14 14v62a14 14 0 0 1-14 14h-70l-26 22v-22h-28a14 14 0 0 1-14-14v-62a14 14 0 0 1 14-14z" ${st} fill="#FFFFFF"/>`;
  if (n === 1) return `<rect x="${cx - 46}" y="${cy - 58}" width="92" height="116" rx="6" fill="#FFFFFF" stroke="#23262B" stroke-width="5"/><path d="M${cx - 30} ${cy - 58}v116" ${st}/>`;
  if (n === 2) return `<path d="M${cx - 96} ${cy - 30}q36-16 60 0v74q-24-16-60 0z M${cx - 36} ${cy - 30}q24-16 60 0v74q-36-16-60 0z" ${st} fill="#FFFFFF"/><circle cx="${cx + 62}" cy="${cy + 4}" r="36" ${st} fill="#FFFFFF"/><path d="M${cx + 62} ${cy - 18}v22l16 12" ${st}/>`;
  if (n === 3) return fuki + `<path d="M${cx - 16} ${cy - 22}a16 16 0 1 1 22 15q-6 3-6 10v6" ${st}/><circle cx="${cx}" cy="${cy + 26}" r="4" fill="#23262B"/>`;
  return fuki + `<path d="M${cx} ${cy - 32}v40" ${st}/><circle cx="${cx}" cy="${cy + 26}" r="4" fill="#23262B"/>`;
}

// ---- 区間ごとの絵の並び（台本 §1 の「画面」）。cue：s 文の番号（0 から）・at 文の中のかけら（その頭から）・plus 秒・pic 絵（seq は [絵, 秒] の並び）
function eNoNarabi(G) {
  const g = (name) => {
    const x = G[name];
    if (!x) throw new Error(`画面の写しがありません：${name}`);
    return { src: pathToFileURL(x.file).href, w: x.w, h: x.h, name, moji: x.moji };
  };
  const mk = (name, kinds) => Object.fromEntries(Object.entries(kinds).map(([k, m]) => [k, G[name].marks[m]]));
  const zen = (name, o = {}) => ({ k: 'zen', g: g(name), o });
  const kiri = (name, haikei, o = {}, x = {}) => ({ k: 'kiri', g: g(name), haikei: haikei ? g(haikei) : null, o, ...x });
  // 27便：760 幅の寄りは、横いっぱい（1840 幅）に置いて字を大きくする（枠の下の帯には重ねない）
  const kiriH = (name, haikei, o = {}, x = {}) => kiri(name, haikei, o, { zenhaba: true, max: 99, ...x });
  const html = (h, pbg, max = 1) => ({ k: 'html', html: h, pbg, max });
  const S = (s) => ({ k: 'html', html: s, pbg: 'transparent', max: 1 });
  const md = readFileSync(path.join(ROOT, 'docs', '線の比べ_6便.md'), 'utf8').split('\n');
  const hyouGyou = [];
  for (const l of md.slice(md.findIndex((x) => x.startsWith('| 線 |')))) { if (!l.startsWith('|')) break; hyouGyou.push(l.split('|').slice(1, -1).map((c) => c.trim())); }
  const [midashiGyou, , ...gyou] = hyouGyou;
  const senHyou = (yori) => html(`<div style="width:${P.w}px;padding:${yori ? '40px 50px' : '24px 34px'};box-sizing:border-box;font-size:${yori ? 27 : 17}px;line-height:1.4;color:#22252A">
      <div style="font-size:${yori ? 34 : 28}px;font-weight:700;margin-bottom:14px">${KASANE.senDai}</div>
      <table style="border-collapse:collapse;width:100%">
      <tr>${midashiGyou.map((c) => `<th style="background:#E5E0D5;border:1px solid #9a9484;padding:6px 10px;text-align:left">${c}</th>`).join('')}</tr>
      ${(yori ? gyou.filter((x) => x[0] === '5便の線').slice(0, 1) : gyou).map((r, i) => `<tr style="${i === 0 && yori ? `outline:6px solid ${ORANGE};outline-offset:-3px;background:#FFF4E2` : 'background:#fff'}">${r.map((c) => `<td style="border:1px solid #9a9484;padding:6px 10px;vertical-align:top">${c}</td>`).join('')}</tr>`).join('')}
      </table></div>`, '#F5F3EE', 1);
  // 28便：「5便の線」の行だけを、4 列（線・中身・決めつけなかった割合（3日分）・1日の空ぶり）にして帯の箱へ
  const senGyou = () => {
    const row = gyou.find((x) => x[0] === '5便の線');
    const td = 'border:2px solid #9a9484;padding:14px 18px;vertical-align:top';
    return { k: 'html', obi: true, pbg: '#F5F3EE', max: 1, html: `<div style="width:1840px;box-sizing:border-box;padding:26px 30px;background:#F5F3EE;border-radius:8px;font-size:40px;line-height:1.45;color:#22252A">
      <div style="font-size:40px;font-weight:700;margin-bottom:16px">${KASANE.senDai}</div>
      <table style="border-collapse:collapse;width:100%">
      <tr>${midashiGyou.slice(0, 4).map((c) => `<th style="${td};background:#E5E0D5;text-align:left">${c}</th>`).join('')}</tr>
      <tr style="outline:8px solid ${ORANGE};outline-offset:-4px;background:#FFF4E2">${row.slice(0, 4).map((c) => `<td style="${td}">${c}</td>`).join('')}</tr>
      </table></div>` };
  };
  const saigo = {
    k: 'zenmen',
    html: `<div style="position:relative;width:1920px;height:1080px;background:#1E2228;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;text-align:center">
      <div style="font-size:72px;font-weight:700">${KASANE.saigo[0]}</div>
      <div style="font-size:36px">${KASANE.saigo[1]}</div>
      <div style="font-size:32px;color:#C9CDD2;margin-top:36px">${KASANE.saigo[2]}</div>
      <div style="font-size:40px;font-weight:700;color:#fff">${KASANE.saigo[3]}</div>
      <div style="position:absolute;left:0;right:0;bottom:44px;font-size:20px;color:#8E949C">${KASANE.koeHyouji}</div></div>`,
  };
  const KO = KASANE.fuda.ko, SEN = KASANE.fuda.sensei;
  // 1 語の書きかえ：before 1.5 秒（28便）（灰の下線）→ 選択 0.3 秒 → 消えて打ち直し 0.7 秒（1 字ずつ・カーソル点滅）→ after 1.5 秒（橙の下線）
  const kakikaeSeq = () => {
    const o = { ue: KASANE.kakinaosu };
    const k = (n, x = {}) => kiriH(n, 'tsutae_d1', { ...o, ...x });
    const n = G.kakiKazu;
    const uchi = [];
    for (let i = 0; i <= n; i++) uchi.push([`kaki_k${i}`, 0.7 / (n + 1) / 2], [`kaki_k${i}_kesu`, 0.7 / (n + 1) / 2]);
    return [
      [k('kaki_mae', { sen: G.kaki_mae.marks.sen, senIro: '#8E949C' }), 1.5],
      [k('kaki_sentaku'), 0.3],
      ...uchi.map(([nm, d]) => [k(nm), d]),
      [k('kaki_ato', { sen: G.kaki_ato.marks.sen }), 1.5],
    ];
  };
  const card = (o) => kiri('card_d1_card', 'card_d1', o, { takasa: Math.round(1080 * 0.7), zenhaba: true, max: 99 });
  const kyouSeq = (n0) => Array.from({ length: 8 }, (_, i) => [S(kyoushitsu({ x0: 110, tomoru: n0 + i > 7 ? 7 : i, migi: true })), 0.12]);
  // 27便 Y5：転A-5 のカード（左 55%）と工夫の札。転A-6 で札を消し、カードを中央へ（250ms）
  // 28便：転A-4〜6 のカードは寄りのまま、高さ 70%（中央）⇔ 62%・左端 x=80 へ 250ms で動かす（引かない）
  // カードは 480 幅の画面の写し（札と重ならない幅にするため）
  const cA = G.card_d1_semai.w / G.card_d1_semai.h;
  const CY = P.y + 20 + (P.h - 40) / 2, H0 = P.h - 40, H1 = 670;
  const cardAt = (t, fudaK = [], o = {}) => { const h = H0 + (H1 - H0) * t; const x0 = 960 - (H0 * cA) / 2; return kiri('card_d1_semai', 'card_d1', o, { abs: { x: x0 + (80 - x0) * t, cy: CY, h }, max: 99, fudaK }); };
  const fadeSeq = (gyou) => Array.from({ length: 6 }, (_, i) => [S(shoNoE({ p: 1, gyou, fade: (i + 1) / 6 })), i < 5 ? 0.05 : 0]);
  return {
    ki: [
      { s: 0, pic: S(hyakuNin({ iro: 0 })) },
      { s: 0, at: '百人に十九人。', seq: Array.from({ length: 20 }, (_, i) => [S(hyakuNin({ iro: i, kazu: i })), i < 19 ? 0.06 : 0]) },
      { s: 1, seq: kyouSeq(0) },
      { s: 2, seq: Array.from({ length: 11 }, (_, i) => [S(hyakuNin({ iro: i, ue: false })), i < 10 ? 0.06 : 0]) },
    ],
    sho: [
      { s: 0, pic: S(shoNoE({ p: 0 })) },
      { s: 0, plus: 0.1, seq: Array.from({ length: 21 }, (_, i) => [S(shoNoE({ p: i / 20 })), i < 20 ? 0.1 : 0]) },
      { s: 1, seq: fadeSeq(1) },
      { s: 2, seq: fadeSeq(2) },
      { s: 3, seq: fadeSeq(3) },
      { s: 4, seq: fadeSeq(4) },
      { s: 4, at: 'でも、', seq: fadeSeq(5) },
      // 27便 Y5：「こちらから具体的にたずねると」の頭で、ゲームの質問画面に寄る（承の教室は背景に暗く残す）
      { s: 4, at: 'こちらから具体的にたずねると、', fuda: KO, pic: { k: 'kiri', g: g('D_mae'), haikeiHtml: shoNoE({ p: 1, gyou: 5 }), o: {} } },
      { s: 5, pic: kiri('home_dai', 'home') },
    ],
    tenA: [
      // 27便 Y3：「同じ問題を、出し方だけ変えて解きます」は 2-up「読む｜聞く」。「読むか、…」で 2-up「図｜区切って」
      { s: 0, fuda: KO, pic: { k: 'narabe', items: [{ label: KASANE.yomu, g: g('yomu') }, { label: KASANE.kiku, soe: KASANE.kikuSoe, g: g('kiku') }] } },
      { s: 0, at: '読むか、', fuda: KO, pic: { k: 'narabe', items: [{ label: KASANE.zu, g: g('zu') }, { label: KASANE.kugiri, g: g('kugiri') }] } },
      // ゲームの全体（760 幅）2 秒：「四十五分で、二十二問」
      { s: 1, fuda: KO, hayaokuri: true, pic: zen('game_1') },
      { s: 1, at: '途中に、', fuda: KO, hayaokuri: true, pic: kiri('D_mae', null, mk('D_mae', { tap: 'choice' })) },
      { s: 1, at: '途中に、', plus: 2.5, fuda: KO, hayaokuri: true, pic: zen('D_ato') },
      { s: 2, fuda: SEN, pic: kiri('d1_hyou', 'sensei_d1') },
      { s: 3, fuda: KO, pic: cardAt(0, [], { sen: G.card_d1_semai.marks.hitokoto }) },
      // 転A-5：カードを寄りのまま左へ（250ms）、右に工夫の札 2 枚（声に合わせて。2 枚目は 1.8 秒後）
      { s: 4, fuda: KO, seq: Array.from({ length: 6 }, (_, i) => [cardAt((i + 1) / 6, [], { sen: G.card_d1_semai.marks.betsu }), i < 5 ? 0.05 : 0]) },
      { s: 4, at: '声に出して読む。', fuda: KO, pic: cardAt(1, [KASANE.kufuu[0]], { sen: G.card_d1_semai.marks.betsu }) },
      { s: 4, at: '声に出して読む。', plus: 1.8, fuda: KO, pic: cardAt(1, KASANE.kufuu, { sen: G.card_d1_semai.marks.betsu }) },
      // 転A-6：札を消し、カードを中央・高さ 70% へ戻す（250ms）
      { s: 5, fuda: KO, seq: Array.from({ length: 6 }, (_, i) => [cardAt(1 - (i + 1) / 6), i < 5 ? 0.05 : 0]) },
    ],
    tenB: [
      // 27便 Y3：全体は 1 秒。声の名詞と同じ所に、2.5 秒ずつ寄る
      { s: 0, fuda: SEN, pic: zen('sensei_d1') },
      { s: 0, at: '比べた結果と、', ato: 1.0, fuda: SEN, pic: kiriH('d1_matome', 'sensei_d1') },
      { s: 0, at: '本人が選んだ答えが並び、', ato: 2.5, fuda: SEN, pic: kiriH('d1_tegakari', 'sensei_d1') },
      { s: 0, at: 'クロードが仮説と、', ato: 2.5, fuda: SEN, pic: kiriH('d1_kakunin', 'sensei_d1', { waku: G.d1_kakunin.marks.waku }) },
      // 27便 Y4：「決めるのは先生です」の頭で、1 語の書きかえ（before 1.0 → 選択 0.3 → 打ち直し 0.7 → after 1.5）
      { s: 0, at: '決めるのは先生です。', fuda: SEN, seq: kakikaeSeq() },
      // 書きかえ（4.0 秒）が終わってから
      { s: 1, ato: 4.0, fuda: SEN, pic: kiriH('kon_sen', 'tsutae_d1', { sen: G.kon_sen.marks.sen }) },
      // 「クラス全員がやるから」：保存した結果（架空の子）の 8 行。転B-4 は全体
      { s: 2, fuda: SEN, pic: kiriH('ichiran_8', 'sensei_top') },
      { s: 3, fuda: SEN, pic: zen('sensei_top') },
    ],
    tenC: [
      { s: 0, fuda: KO, pic: zen('sodateru_d1') },
      { s: 1, fuda: KO, pic: kiri('kyou_renshu', 'sodateru_d1', { ue: KASANE.nerai, ueIro: '#D8D3C7' }) },
      { s: 1, plus: 2.5, fuda: KO, pic: kiri('kyou_yarikata', 'sodateru_d1', { ue: KASANE.sasae, ueIro: '#D8D3C7' }) },
      { s: 2, at: '明日は、', fuda: KO, pic: { k: 'narabe', items: [{ label: KASANE.sodateMae, g: g('sodate_mae') }, { label: KASANE.sodateAto, g: g('sodate_ato') }] } },
      // 27便 Y3：「できた、を自分で積んでいきます」は、レベルの行だけを 2 枚並べる
      { s: 2, at: 'できた、', fuda: KO, pic: { k: 'narabe', mukashi: true, items: [{ label: KASANE.sodateMae, g: g('sodate_mae_level') }, { label: KASANE.sodateAto, g: g('sodate_ato_level') }] } },
    ],
    fukasa: [
      { s: 0, fuda: KO, pic: kiri('kiku_ichibun', 'kiku_zen') },
      // 27便 Y3：記録の Claude の 3 行を 1 行ずつ。行末の「（Claude）」に枠
      ...[1, 2, 3].map((n) => ({ s: 0, plus: 2.5 + (n - 1) * 2, fuda: SEN, shita: KASANE.kirokuNoHi, pic: kiri(`kiroku_${n}`, null, { waku: G[`kiroku_${n}`].marks.waku }, { obi: true, max: 99 }) })),
      // 3 行目も 2 秒見せてから（左右の比べは少し後ろへ）
      { s: 1, ato: 2.0, fuda: SEN, pic: kiri('hidari_li', 'sensei_d1', { waku: G.hidari_li.marks.waku, wakuIro: '#9A9484', ue: KASANE.kimatta }, { fuchi: '#9A9484', obi: true, max: 99 }) },
      { s: 1, plus: 1.5, ato: 2.5, fuda: SEN, pic: kiri('migi_tsugi', 'sensei_d1', { waku: G.migi_tsugi.marks.waku, ue: KASANE.claude }, { obi: true, max: 99 }) },
      { s: 2, fuda: SEN, pic: zen('sensei_d1') },
      // 27便 Y3：「本人にも、周りにも見える」は 2-up：左＝仮説の箱（灰の枠）｜右＝カード（高さ 60%）
      { s: 2, at: '本人にも、', pic: { k: 'narabe', items: [{ label: KASANE.mieru[0], g: g('d1_kasetsu_semai'), fuchi: '#9A9484' }, { label: KASANE.mieru[1], g: g('card_d1_semai') }] } },
      // 線の表：全体 1.5 秒 → 「5便の線」の行だけ
      { s: 3, pic: senHyou(false) },
      { s: 3, plus: 1.5, pic: senGyou() },
    ],
    ketsu: [
      { s: 0, pic: S(kyoushitsu({ x0: (W - KW) / 2 })) },
      { s: 0, at: 'クラス全員が使えます。', seq: Array.from({ length: 36 }, (_, i) => [S(kyoushitsu({ x0: (W - KW) / 2, cards: i })), i < 35 ? 0.05 : 0]) },
      { s: 1, fuda: KO, pic: card({}) },
    ],
    saigo: [{ s: null, pic: saigo }],
  };
}

// ---- 4. 時間割を作り、つなぐ
// 文ごとの長さと、文の中のかけら（読点まで）の頭の時刻を決める。合成の声はかけらの長さの目安で、先生の声は字数で割り付ける
function jikanwari(koe, sensei, cues) {
  const kukan = [];
  let fAll = 0;
  const yomiKakera = (b) => kakeraOf(yomiOf(b));
  for (const sec of [...DAIHON, { id: 'saigo', na: '最後の一枚', bun: [], kaname: [], chuui: [], waku: '#1E2228' }]) {
    const f0 = fAll;
    const bun = sec.bun.map((koeBun, i) => {
      const key = `${sec.id}_${i + 1}`;
      const ka = kakeraOf(koeBun);
      const jk = ka.map(jimakuOf);
      if (yomiKakera(koeBun).length !== ka.length) throw new Error(`読みを直した文のかけらの数が変わりました：${koeBun}`);
      return { key, koe: koeBun, kakera: ka, jkakera: jk, jimaku: jk.join(''), kaname: sec.kaname.includes(i) };
    });
    let len;
    if (sec.id === 'saigo') len = SAIGO;
    else if (sensei[sec.id]) {
      // 先生の声：区間の長さを、文の字数で割り付ける（文の間も字数の割合に含める。厳密でなくてよい）
      const d = wavNoNakami(sensei[sec.id].file).length / SAMPLE;
      const zen = bun.reduce((a, b) => a + haba(b.jimaku), 0);
      let t = ATAMA;
      for (const b of bun) {
        b.t0 = t; b.d = (d * haba(b.jimaku)) / zen;
        const w = b.jkakera.map(haba); const sw = w.reduce((a, x) => a + x, 0);
        let acc = 0; b.kt = w.map((x) => { const s = b.t0 + (b.d * acc) / sw; acc += x; return s; });
        t += b.d;
      }
      sec.senseiNoKoe = sensei[sec.id].moto;
      len = ATAMA + d + (bun[bun.length - 1].kaname ? KANAME_MA : 0);
    } else {
      let t = ATAMA;
      bun.forEach((b, i) => {
        b.t0 = t; b.d = koe.nagasa[b.key];
        const w = koe.bubun[b.key]; const sw = w.reduce((a, x) => a + x, 0);
        let acc = 0; b.kt = w.map((x) => { const s = b.t0 + (b.d * acc) / sw; acc += x; return s; });
        t += b.d + (i < bun.length - 1 ? AIDA : 0) + (b.kaname ? KANAME_MA : 0);
      });
      len = t;
    }
    const fLen = Math.round(len * FPS);
    const fr = (x) => f0 + Math.min(fLen, Math.max(0, Math.round(x * FPS)));
    // 字幕の札（かけらを 22 字までまとめる）
    const mai = [];
    bun.forEach((b, i) => {
      const owari = i < bun.length - 1 ? bun[i + 1].t0 : len;
      const ms = jimakuNoMai(b.jkakera);
      ms.forEach((m, k) => mai.push({ f: fr(b.kt[m.k[0]]), owari: k === ms.length - 1 ? fr(owari) : null, lines: m.gyou, bun: i }));
    });
    mai.forEach((m, k) => { if (m.owari == null) m.owari = mai[k + 1].f; });
    // 絵の切りかわり
    const e = [];
    const tOf = (c) => {
      if (c.s == null) return 0;
      const b = bun[c.s];
      let t = c.s === 0 && !c.at && !c.plus ? 0 : b.t0;
      if (c.at) {
        const k = b.kakera.indexOf(c.at);
        if (k < 0) throw new Error(`${sec.na}：文に「${c.at}」のかけらがありません`);
        t = b.kt[k];
      }
      return t + (c.plus || 0);
    };
    let maeT = 0;
    for (const c of cues[sec.id]) {
      const notes = { fuda: c.fuda || '', kukan: sec.kukan || '', hayaokuri: c.hayaokuri ? KASANE.hayaokuri : '', shita: c.shita || '', kakuu: sec.id === 'sho' ? KASANE.kakuu : '', chuui: sec.chuui || [], waku: sec.waku };
      // 27便：ato＝前の絵から少なくともこの秒は置く（寄りの最短 2.5 秒を守るため、声の名詞より少し遅れることがある）
      let tt = c.ato ? Math.max(tOf(c), maeT + c.ato) : tOf(c);
      maeT = tt;
      if (c.seq) for (const [pic, d] of c.seq) { e.push({ f: fr(tt), pic, notes }); tt += d; }
      else e.push({ f: fr(tt), pic: c.pic, notes });
    }
    e.sort((a, b) => a.f - b.f);
    const kireme = [...new Set([f0, f0 + fLen, ...e.map((x) => x.f), ...mai.flatMap((m) => [m.f, m.owari])])].filter((x) => x >= f0 && x <= f0 + fLen).sort((a, b) => a - b);
    const koma = [];
    for (let k = 0; k < kireme.length - 1; k++) {
      const a = kireme[k], b = kireme[k + 1];
      if (b <= a) continue;
      const ev = e.filter((x) => x.f <= a).pop() || e[0];
      const jm = sec.jimakuNashi ? null : mai.find((m) => m.f <= a && a < m.owari);
      koma.push({ f: a, n: b - a, spec: { pic: ev.pic, ...ev.notes, jimaku: jm ? jm.lines : [] } });
    }
    kukan.push({ id: sec.id, na: sec.na, koe: sec.koe, senseiNoKoe: sec.senseiNoKoe || null, f0, fLen, bun: bun.map((b) => ({ ...b, f: fr(b.t0) })), mai, koma });
    fAll += fLen;
  }
  return { kukan, fAll };
}

// 寄りの秒と、寄りの中の字の大きさ（画面写しの CSS の字 × 倍率）を数える
function yoriNoShirabe(kukan, scOf) {
  const out = [];
  for (const k of kukan) {
    let cur = null;
    const push = () => { if (cur) out.push(cur); cur = null; };
    for (const x of k.koma) {
      const p = x.spec.pic;
      if (p.k !== 'kiri') { push(); continue; }
      const name = p.g.name.replace(/_(tsuku|kesu)$/, '').replace(/^type_\d$/, 'type');
      if (cur && cur.name === name) { cur.byou += x.n / FPS; continue; }
      push();
      const sc = scOf(x.spec);
      cur = { kukan: k.na, name, byou: x.n / FPS, moji: p.g.moji && sc ? Math.round(p.g.moji * DSF * sc) : null };
    }
    push();
  }
  return out.map((y) => ({ ...y, byou: Number(y.byou.toFixed(2)) }));
}

function ff(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg が止まりました：${args.join(' ')}`);
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,sample_rate', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
}

async function main() {
  rmSync(KOMA, { recursive: true, force: true });
  rmSync(NAKA, { recursive: true, force: true });
  mkdirSync(SAGYOU, { recursive: true });
  console.log('1. 声を作る');
  const koe = koeWoTsukuru();
  const sensei = senseiNoKoe();
  if (Object.keys(sensei).length) console.log(`   先生の声：${Object.values(sensei).map((x) => x.moto).join('・')}`);
  // 声の文 28 文・字幕・字幕・小・重ねる文を、言葉の正本で点検する
  const tenkenSuru = [...DAIHON.flatMap((s) => [...s.bun, ...s.bun.map((b) => kakeraOf(b).map(jimakuOf).join('')), ...s.chuui, s.kukan || ''])
    , ...JSON.stringify(KASANE).match(/"[^"]*"/g).map((x) => JSON.parse(x))];
  const hits = tenkenSuru.flatMap((s) => tenken(s).map((h) => `${h['言葉']}（${s}）`));
  if (hits.length) throw new Error(`避ける言葉が見つかりました：${hits.join('／')}`);
  console.log('2. 画面を写す');
  const G = await gamenWoUtsusu();
  console.log('3. 時間割と一コマずつの絵');
  const { kukan, fAll } = jikanwari(koe, sensei, eNoNarabi(G));
  const zenByou = fAll / FPS;
  if (zenByou > NAGASA_MAX) throw new Error(`動画が ${zenByou.toFixed(1)} 秒で 3:00 を超えます。落とす文は先生が決めます（台本 §2 の順：${OTOSU_JUN}）`);
  const specs = kukan.flatMap((k) => k.koma.map((x) => x.spec));
  const { fileOf, scOf } = await komaWoKumu(specs);
  console.log(`   一コマの絵 ${new Set(specs.map((s) => fileOf(s))).size} 枚`);

  console.log('4. 区間ごとに mp4 にして、つなぐ');
  const kukanMp4 = [];
  for (const k of kukan) {
    const list = path.join(SAGYOU, `${k.id}.txt`);
    const lines = ['ffconcat version 1.0'];
    for (const x of k.koma) lines.push(`file '${fileOf(x.spec)}'`, `duration ${(x.n / FPS).toFixed(6)}`);
    lines.push(`file '${fileOf(k.koma[k.koma.length - 1].spec)}'`);
    writeFileSync(list, lines.join('\n') + '\n');
    const out = path.join(SAGYOU, `${k.id}.mp4`);
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS},format=yuv420p`, '-frames:v', String(k.fLen), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-r', String(FPS), '-video_track_timescale', '15360', out]);
    kukanMp4.push(out);
  }
  const tsunagi = path.join(SAGYOU, 'tsunagi.txt');
  writeFileSync(tsunagi, kukanMp4.map((f) => `file '${f}'`).join('\n') + '\n');
  const eizou = path.join(SAGYOU, 'eizou.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', tsunagi, '-c', 'copy', eizou]);

  // 声：文の頭のコマに合わせて置く（先生の声の区間は、区間の頭の間のあとにまとめて置く）
  const perF = SAMPLE / FPS;
  const oto = new Int16Array(fAll * perF);
  const oku = (wav, f) => oto.set(wav.subarray(0, Math.max(0, oto.length - f * perF)), f * perF);
  for (const k of kukan) {
    if (sensei[k.id]) { oku(wavNoNakami(sensei[k.id].file), k.f0 + Math.round(ATAMA * FPS)); continue; }
    for (const b of k.bun) oku(wavNoNakami(path.join(KOE, `${b.key}.wav`)), b.f);
  }
  const otoFile = path.join(SAGYOU, 'koe.wav');
  wavWoKaku(otoFile, oto);
  ff(['-i', eizou, '-i', otoFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SAMPLE), '-ac', '2', '-movflags', '+faststart', DEKIAGARI]);

  // 区間ごとの真ん中のコマ
  mkdirSync(NAKA, { recursive: true });
  kukan.forEach((k, i) => {
    const t = (k.f0 + k.fLen / 2) / FPS;
    ff(['-ss', t.toFixed(3), '-i', DEKIAGARI, '-frames:v', '1', '-q:v', '3', path.join(NAKA, `${String(i + 1).padStart(2, '0')}_${k.na.replace(/\s/g, '')}.jpg`)]);
  });

  const pr = probe(DEKIAGARI);
  const yori = yoriNoShirabe(kukan, scOf);
  const kekka = {
    ファイル: DEKIAGARI,
    長さ: Number(pr.format.duration).toFixed(2),
    大きさ: `${(statSync(DEKIAGARI).size / 1024 / 1024).toFixed(1)} MB`,
    流れ: pr.streams.map((s) => s.codec_name === 'aac' ? `aac ${s.sample_rate}Hz` : `${s.codec_name} ${s.width}×${s.height} ${s.r_frame_rate}`),
    区間: kukan.map((k) => ({ 区間: k.na, 秒: (k.fLen / FPS).toFixed(2), 声: k.senseiNoKoe ? `先生の声（${k.senseiNoKoe}）` : k.bun.reduce((a, b) => a + b.d, 0).toFixed(2) })),
    声の文: kukan.reduce((a, k) => a + k.bun.length, 0),
    字幕の枚数: kukan.reduce((a, k) => a + (DAIHON.find((d) => d.id === k.id)?.jimakuNashi ? 0 : k.mai.length), 0),
    字幕の2行: kukan.flatMap((k) => k.mai.filter((m) => m.lines.length > 1).map((m) => m.lines.join(' / '))),
    寄り: yori,
    寄りの短いもの: yori.filter((y) => y.byou < KIRI_MIN).map((y) => `${y.kukan} ${y.name} ${y.byou} 秒`),
    寄りの字の小さいもの: yori.filter((y) => y.moji && y.moji < KIRI_MOJI).map((y) => `${y.kukan} ${y.name} ${y.moji}px`),
    同じ文章の読む版と聞く版: G.onajiMondai,
    // 28便：2-up（900×700 の箱に contain）の、切り出しの中のおもな字の 1080p での大きさ
    '2-up の字': Object.fromEntries(['yomu', 'kiku', 'zu', 'kugiri', 'd1_kasetsu_semai', 'card_d1_semai', 'sodate_mae', 'sodate_ato'].map((n) => { const x = G[n]; const sc = Math.min(900 / x.w, 700 / x.h); return [n, x.moji ? `${Math.round(x.moji * DSF * sc)}px（${Math.round(x.w * sc)}×${Math.round(x.h * sc)}）` : `${Math.round(x.w * sc)}×${Math.round(x.h * sc)}`]; })),
    選んで答える質問: G.D_toi,
    一語の書きかえ: `「${G.kakikae.mae}」→「${G.kakikae.ato}」（1 文目：${G.kakikae.ichibun}）`,
    保存した結果の一覧: G.ichiranGyou,
    レベルの行: [G.sodate_mae_levelBun, G.sodate_ato_levelBun],
    撮る幅: '760×428（2.5 倍）。図＋2×2 と先生の画面のデモ1 の全体だけ 960×540',
    字幕・小と枠の重なり: '0 コマ（一コマずつ確かめた）',
    次を選んだ理由の記録: `資料 31 の ${G.kirokuGyou.zen} 行（うち Claude ${G.kirokuGyou.claude} 行）。映したのは ${G.kirokuGyou.utsushita.length} 行`,
    字幕の点検: '避ける言葉 0 件',
  };
  writeFileSync(path.join(SAGYOU, 'kekka.json'), JSON.stringify(kekka, null, 1));
  writeFileSync(path.join(SAGYOU, 'jimaku.txt'), kukan.flatMap((k) => k.mai.map((m) => `${(m.f / FPS).toFixed(2)}\t${k.id}\t${m.lines.join(' / ')}`)).join('\n') + '\n');
  console.log(JSON.stringify(kekka, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e); process.exit(1); });
