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
import { kotaeD, matome } from '../public/js/kurabe.js';

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
  { id: 'sho', koe: '02_sho', na: '承', waku: '#1E2228', kaname: [6], jimakuNashi: true, chuui: [],
    bun: [
      '問題は解けているのに、説明の板書は写さない。',
      '読むのが遅くて、置いていかれる。読んだのに、意味が入ってこない。',
      '本人も、周りの大人も気づかず、サボっていると思われてしまう。',
      '困ったら言ってね、と先生が言っても言語化ができない。',
      'でも、先生からの声かけには、生徒は答えられます。',
      'これらの例は、よく気づく先生にしか見えないし、本人だけでは気づけない。小さいようで、大きな問題。',
      '個に応じた最適な指導がしたい。それも、クラス全員に。そのために提案するのが、チカラのスイッチです。',
    ] },
  { id: 'tenA', koe: '03_tenA', na: '転A', waku: '#3A2E1A', kukan: '① 見つける', kaname: [2],
    chuui: ['合計・順位・枚数は出しません。差が出なかった子にもカードが届きます。'],
    bun: [
      '同じ問題も、問い方を変えてみる。読むか、聞くか。文か、図か。一気に読むか、区切って読むか。',
      '比べるのは、他人ではなく、解き方を変えてみた自分。',
      '読んでもできなかったけど、聞いて考えたら、できた。その事実が、スイッチカードになって、本人に残ります。',
      '自分のチカラの出し方を知った子は、学習でも日常でも、自分で工夫できるようになる。たとえば、声に出して読む。分からないときは、聞き返す。',
      '困りを言葉にできなくても、カードが、その子の言葉になります。',
    ] },
  { id: 'tenB', koe: '04_tenB', na: '転B', waku: '#1A3448', kukan: 'Claude が下書き', kaname: [0],
    chuui: ['仮説は参考程度。決めるのは先生です。', '医療や専門の検査の代わりではありません。その手前を受け持ちます。', '保護者にも同じカードの言葉で伝えます。'],
    bun: [
      '先生の画面には、クロードが指導のヒントを出してくれます。もちろん、伝えるのは目の前の子どもを相手にする先生。',
      '大事な連絡は、口でも伝える。問題文を読んであげる。そして、生徒は安心して学べる。',
      '特別な支援ではなく、ちょっとした工夫になり、生徒への理解は信頼関係につながる。',
      '一人一人に支援が行き渡る、そのきっかけになるアプリです。',
    ] },
  { id: 'tenC', koe: '05_tenC', na: '転C', waku: '#352848', kukan: '② 育てる', kaname: [], chuui: [],
    bun: [
      'カードは、育てることができる。',
      '得意なカードを支えにして、別のカードを、朝学習など10分ほどで練習する。',
      '今日は、聞きながら読む。明日は、支えを少し減らして、もう一度。できた、を自分で積んでいきます。',
    ] },
  { id: 'fukasa', koe: '06_fukasa', na: 'Claude と深さ', waku: '#1A3F28', kukan: 'Claude がすること', kaname: [0],
    chuui: ['出力は、避ける言葉で機械的に点検し、引っかかれば書き直させます。', '架空の子のデータで確かめました。'],
    bun: [
      'クロードは、生徒の答えから、次のチカラの出し方を選び、スイッチを育てる計画を書きます。',
      'よく気づく先生にしか見えなかったことが、本人にも、周りにも見える。チカラのスイッチは、そのきっかけを作ります。',
    ] },
  { id: 'ketsu', koe: '07_ketsu', na: '結', waku: '#1E2228', kaname: [1],
    chuui: ['学校ごとの設定で、次の年にも引き継げます。', '学力への効果は確かめていません。言えるのは、ゲームの中で、支えが少なくてもできた、という事実までです。'],
    bun: [
      '初回のホームルームと、10分ほどのすき間時間で、生徒全員の学びに寄り添える。',
      '言葉にできなくても、チカラのスイッチを、みんなで探そう。',
    ] },
];
const OTOSU_JUN = '（11/8 14:03 先生の削りで収める。ほかに落とす文は先生に聞く）';

// 合成の声に渡すときだけ読みを直す（文は変えない）。既定の辞書だと「言って」を「ゲンッテ」、「区切って」を「クギリッテ」と読むため
const YOMI_NAOSHI = [['言ってね', 'いってね'], ['区切って', 'くぎって'], ['10分', 'じゅっぷん']];
// 字幕：「クロード」は「Claude」、かな数字（漢数字）は算用数字。起-1 は「国際学力調査 PISA の結果です。」、転B-2 は『 』付き（批評の表）。
// 読点で切った「かけら」ごとに直す（字幕の枚数は、かけらを 22 字までまとめて決める）
const JIMAKU_KAE = [
  ['国際学力調査、', '国際学力調査 '], ['ピザの', 'PISA の'], ['大事な連絡は、', '『大事な連絡は、'], ['口でも伝える。', '口でも伝える』。'],
  ['クロード', 'Claude'], ['十五歳', '15 歳'], ['百人に十九人', '100 人に 19 人'], ['二十万人', '20 万人'], ['三十五人', '35 人'],
  ['六人か七人', '6 人か 7 人'], ['十人に一人', '10 人に 1 人'], ['四十五分', '45 分'], ['二十二問', '22 問'], ['朝の十分', '朝の 10 分'], ['10分', '10 分'],
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
  ki: { ue: 'PISA 2025　国際学力調査', hito: ['100 人に', '人'], otona: ['10 人に', '1', '人'], kyoushitsu: ['35 人に', '6〜7 人', 'およそ 20 万人'] },
  sho: ['説明の板書は、写さない。', '読むのが遅くて、置いていかれる。', 'サボっている、と思われてしまう。', '『言ってね』では、言語化できない。', '先生の声かけには、答えられる。'],
  yomu: '📖 読む', kiku: '👂 聞く', kikuSoe: '左と同じ文章を、声で',
  zu: '🗺️ 図で見る', kugiri: '✂️ 一文ずつ読む',
  sodateMae: '8 回目の練習のあと', sodateAto: '12 回目の練習のあと',
  kimatta: 'Claude を使わないとき', claude: 'Claude の下書き',
  saigo: ['チカラのスイッチ', '言葉にできなくても、力のスイッチを見つけて育てる', 'github.com/takemoto-droid/chikara-no-switch', 'Built with Claude Code'],
  // 声 “Mei” は CC BY 3.0。docs/権利と出典.md の決まり（動画にも同じ表示を入れる）で、最後の一枚の下に小さく出す
  // 27便 Y3〜Y5：寄りの上の札・転A-5 の工夫の札・深さ-3 の 2 枚の見出し
  kakinaosu: '先生が書き直す',
  kufuu: ['声に出して読む', '分からないときは 聞き返す'],
  mieru: ['先生に見える', '本人に見える'],
  nerai: 'ねらい', sasae: 'きょうの支え',
  // 32便：絵の区間に出す言葉（声の文の言葉）。言葉の正本で点検する
  e32: ['同じ問題', '読む', '聞く', '文', '図', '一気に', '区切って', '分', '問', '比べた結果', '本人が選んだ答え', 'Claude（AI）が書いた', '仮説', '根拠つき', '大事な連絡は、口でも伝える', '一人一人に', '支援が行き渡る', 'そのきっかけ', '測る問題', '問題 A', '問題 B', '問題 C', '何の差？', '一回や二回で、決めつけない', 'Claude'],
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
    // 30便：全画面の写しは、ページの上端から（スクロールの途中で字やボタンが切れないように）
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const v = page.viewportSize();
    if (v.width > HIROI.w) throw new Error(`${name}：${v.width} 幅で写そうとしました（27便：1280 幅で写す画面は無い）`);
    // 30便：板の下端で字の行・ボタン・枠が切れないよう、どの要素もまたがない高さで切る（画面の 85% より下で最初の切れ目。
    // 大きな箱がまたぐときは、その下まで 1.8 倍までのばす。無ければ画面の中で最後の切れ目）
    const takasa = await page.evaluate((vh) => {
      // 見えるものを描く要素だけ（自分の字・絵・ボタン・入力欄・枠や地の色）。中身を包むだけの入れ物は数えない
      const mieru = (el) => {
        if (/^(IMG|SVG|BUTTON|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)) return true;
        if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
        const cs = getComputedStyle(el);
        return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
      };
      const els = [...document.body.querySelectorAll('*')].filter((el) => el.offsetParent !== null || el.tagName === 'svg').filter(mieru).map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0 && b.height < vh * 1.5 && b.width < window.innerWidth - 2);
      const matagu = (y) => els.some((b) => b.top < y - 1 && b.bottom > y + 1);
      const ys = [...new Set(els.map((b) => Math.ceil(b.bottom + 10)))].sort((a, b) => a - b);
      const doc = document.documentElement.scrollHeight;
      const shita = ys.find((y) => y >= vh * 0.85 && y <= Math.min(vh * 1.8, doc) && !matagu(y));
      if (shita) return shita;
      const ue = ys.filter((y) => y <= vh && !matagu(y)).pop();
      return ue || vh;
    }, v.height);
    await shashin(page, name, { x: s.x, y: s.y, width: v.width, height: takasa }, marks);
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
    await kiru(page, 'home_dai', union(dai), {}, { ue: 16, shita: 6, yoko: 16 }, { moji: await mojiNoOokisa(page, 'main h1, #app h1') });
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
      // 30便：2-up の切り出しは左右の余白なし（840 幅の列で字を大きく）
      const gameKiru = async (name, mode) => kiru(page, name, await gameNoBasho(mode), {}, mode === 'yomu' ? { ue: 6, shita: 4, yoko: 0 } : { ue: 6, shita: 14, yoko: 0 }, { moji: await mojiNoOokisa(page, mode === 'kiku' ? '#riyuu' : '#mondai .honbun, #mondai .toi, #mondai') });
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
                  await kiru(page, 'zu', union(zr), {}, { ue: 10, shita: 10, yoko: 0 }, { moji: zm });
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
    // 39便：37便から、表は「くわしく：数字の表と、数え方」の折りたたみの中。開いてから測る
    await p2.locator('summary', { hasText: '数字の表と、数え方' }).click();
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
    // #kasetsu の中：0 札・1 仮説・2 次に試すなら・3 確かめた回数・4 参考程度・5 くわしく（そう考えた理由。37便で折りたたみ）・6 保存の印
    const riyuu = kp.findIndex((x) => x.tag === 'UL' || (x.tag === 'DETAILS' && x.t.includes('そう考えた理由')));
    if (riyuu < 0 || !kp[1].t.startsWith('仮説') || !kp[3].t.startsWith('確かめた回数')) throw new Error('先生の画面の仮説の欄の形が、思っていたものと違います');
    // 転B-1「Claude が仮説と、懇談の下書きを書きます」：札（Claude が書いた下書き）・仮説・確かめた回数。仮説の 1 行と確かめた回数に枠
    await kiru(p2, 'd1_kakunin', union(kp.slice(0, 4).map((x) => x.r)), { waku: [kp[1].r, kp[3].r] }, { ue: 8, shita: 10, yoko: 14 }, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(2)') });
    // 深さ-3 の左：仮説の箱の「耳で聞いて答えるとき、力が出ているかも。」（760 幅で切り出す）
    const kasetsuMoji = await p2.locator('#kasetsu > :nth-child(2)').first().evaluate((el) => window.__moji(el, el.textContent.trim()));
    await moji(p2, '#kasetsu > :nth-child(2)', '耳で聞いて答えるとき、力が出ているかも。');
    await kiru(p2, 'd1_kasetsu', union(kasetsuMoji), {}, 16, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(2)') });
    // 深さ-2 の右：Claude の下書きの「次に試すなら」の文。「こちらから〜声をかけて〜」の句に枠（39便：保存した文を取り直したので、句は保存した文から選ぶ）
    await kiru(p2, 'migi_tsugi', kp[2].r, { waku: await moji(p2, '#kasetsu > :nth-child(3)', kobetsuNoKu(await p2.locator('#kasetsu > :nth-child(3)').first().textContent())) }, 16, { moji: await mojiNoOokisa(p2, '#kasetsu > :nth-child(3)') });

    await p2.goto(`${BASE}#/card/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('.switch-card');
    await zen(p2, 'card_d1');
    await kiru(p2, 'card_d1_card', await shikaku(p2, '.switch-card'), { hitokoto: await moji(p2, '.switch-card', '聞いて 考えると、力が 出せるかも'), betsu: await moji(p2, '.switch-card', '別の日は 違うかも。') }, 10, { moji: await mojiNoOokisa(p2, '.switch-card .hitokoto') });

    // 28便：深さ-3 の右のカードは 480 幅の画面から（900×700 の箱で一言を 40px 以上に）
    {
      const pc = await atarashii(SEMAI);
      await pc.goto(`${BASE}#/card/${encodeURIComponent('デモ1')}`);
      await pc.waitForSelector('.switch-card');
      await kiru(pc, 'card_d1_semai', await shikaku(pc, '.switch-card'), { hitokoto: await moji(pc, '.switch-card', '聞いて 考えると、力が 出せるかも'), betsu: await moji(pc, '.switch-card', '別の日は 違うかも。') }, { ue: 10, shita: 10, yoko: 0 }, { moji: await mojiNoOokisa(pc, '.switch-card .hitokoto') });
      // 深さ-3 の左：仮説の 1 文も 480 幅の画面から（2 行に折り返し、字を大きく）
      await pc.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
      await pc.waitForSelector('#kasetsu .label.ai');
      await yoi(pc);
      const km = await pc.locator('#kasetsu > :nth-child(2)').first().evaluate((el) => window.__moji(el, el.textContent.trim()));
      await moji(pc, '#kasetsu > :nth-child(2)', '耳で聞いて答えるとき、力が出ているかも。');
      await kiru(pc, 'd1_kasetsu_semai', union(km), {}, { ue: 12, shita: 12, yoko: 4 }, { moji: await mojiNoOokisa(pc, '#kasetsu > :nth-child(2)') });
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
    // 39便：取り直した保存文の 1 文目は「この前のゲームでは、…」なので、どちらも無いときは「この前」→「先週」（台本の決め直しは先生と司令塔）
    const KAE = ichibun.includes('ご家庭で') ? ['ご家庭で', 'おうちで'] : ichibun.includes('今回') ? ['今回', 'この日'] : ichibun.includes('この前') ? ['この前', '先週'] : null;
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
    // 39便：取り直した保存文では「大事な説明や宿題を口でも伝える」。どちらの文でも動くように、ある方を使う
    const KOUHO_SEN = ['大事な説明や宿題・持ち物を口でも伝える', '大事な説明や宿題を口でも伝える'];
    const sen = await ta.evaluate((t, ks) => ks.find((k) => t.value.includes(`授業では、${k}`)) || ks[0], KOUHO_SEN);
    const BUN = `授業では、${sen}`;
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
      // 30便：見出しの下の注釈（名前も結果も架空）は飛ばす
      while (n && n.tagName === 'P') { if (n.querySelector('a[href^="#/sensei/ko/"]')) { rs.push(window.__shikaku(n)); t.push(n.textContent.trim()); } n = n.nextElementSibling; }
      return { rs, t, moji: parseFloat(getComputedStyle(h.nextElementSibling).fontSize) };
    });
    if (ichiran.t.length !== 8 || !ichiran.t.some((x) => x.includes('同じくらいだった子'))) throw new Error(`保存した結果の一覧が 8 行ではありません：${ichiran.t.join('／')}`);
    // 8 行だけ（見出しは入れない）。字の幅で切る（行は横いっぱいに広がるため）
    const ichiranMoji = await p2.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('保存した結果（架空の子）')); const out = []; let n = h.nextElementSibling; while (n && n.tagName === 'P') { if (n.querySelector('a[href^="#/sensei/ko/"]')) out.push(...window.__moji(n, n.textContent.trim())); n = n.nextElementSibling; } return out; });
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
    // 29便：行頭の「・」が切れないよう、左に 16px 足す
    const hl = await shikaku(p3, hidariLi);
    await kiru(p3, 'hidari_li', { ...hl, x: hl.x - 16, width: hl.width + 16 }, { waku: await moji(p3, hidariLi, 'そのままにしている') }, { ue: 4, shita: 4, yoko: 14 }, { moji: await mojiNoOokisa(p3, hidariLi) });
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
    // 39便：37便から、記録は「くわしく：ゲームで Claude が次を選んだ理由」の折りたたみの中。開いて、その中だけを測る
    const sum5 = p5.locator('summary', { hasText: 'Claude が次を選んだ理由' });
    await sum5.waitFor();
    await sum5.click();
    await sum5.evaluate((x) => x.closest('details').setAttribute('data-douga', 'kiroku'));
    await p5.waitForTimeout(300);
    await yoi(p5);
    const g5 = await sum5.evaluate((x) => [...x.closest('details').querySelectorAll('li')].map((li) => ({ t: li.textContent.replace(/\s+/g, ' ').trim(), r: window.__shikaku(li) })));
    if (g5.length !== mitai.length || g5.some((g, i) => g.t !== mitai[i])) throw new Error(`記録の欄の行が、資料 31 の文と違います：\n${g5.map((g) => g.t).join('\n')}`);
    const liMoji = await p5.locator('[data-douga="kiroku"] li').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const olR = await p5.locator('[data-douga="kiroku"] ol').first().evaluate((el) => window.__shikaku(el));
    for (const [k, i] of SAN.entries()) {
      const sel = `[data-douga="kiroku"] ol > li:nth-child(${i + 1})`;
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
// 30便：見た目の決まり（資料 37 第3版）。地は全編 #E4E8EC。グリッドは左右 80px・見出し y=36・中身 y=104〜862・注意書き y=876・字幕 y=944。
// アプリの写しは「白い板が浮いている」形だけ（角丸 14・影・髪の毛ほどの線）。帯・二重の枠・暗くした後ろの画面は使わない
const JI = '#E4E8EC';
const C = { x: 80, y: 104, w: 1760, h: 758 }; // 中身の領域
const CI = { x: 80, y: 114, w: 1760, h: 738 }; // 板を置く領域（ゆっくり 1.03 倍に寄っても中身の領域から出ないよう、上下 10px 内側）
const CHUUI_UE = 876; // 注意書き（1 行）の上端。2 行なら 862
const OBI = 944; // 字幕の上端
const IRO = { jimaku: '#161B21', midashi: '#1F2933', label: '#55606B', suuji: '#C46F10', shirushi: '#E08A1E', ao: '#2F6F8F', sen: '#A9B4BF', fudaJi: '#3E4A56', ten: '#C3CBD3' };
const LABEL_H = 39; // ラベル 30px × 1.3
const KUMI_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:"BIZ UDPGothic",sans-serif;}
#f{position:absolute;inset:0;background:${JI};}
#naka{position:absolute;inset:0;transform-origin:${C.x + C.w / 2}px ${C.y + C.h / 2}px;}
#ue{position:absolute;left:${C.x}px;top:36px;height:46px;display:flex;align-items:center;gap:18px;}
#fuda{height:44px;line-height:41px;padding:0 20px;border-radius:999px;border:1.5px solid ${IRO.sen};color:${IRO.fudaJi};font-size:30px;box-sizing:border-box;}
#kukan{font-size:36px;font-weight:700;color:${IRO.midashi};}
#jimaku{position:absolute;left:${C.x}px;width:${C.w}px;top:${OBI}px;color:${IRO.jimaku};font-size:56px;line-height:1.2;font-weight:700;text-align:center;}
#chuui{position:absolute;left:${C.x}px;width:${C.w}px;top:${CHUUI_UE}px;color:${IRO.label};font-size:30px;line-height:1.3;text-align:center;}
#chuui > div{white-space:nowrap;}
#kakuu{position:absolute;right:${1920 - C.x - C.w}px;top:${C.y + C.h + 4}px;font-size:26px;color:${IRO.label};}
#zenmen{position:absolute;inset:0;display:none;}
.hide{display:none!important;}
.ita{position:absolute;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(31,41,51,.12),0 18px 48px rgba(20,35,55,.22);}
.ita > img{width:100%;height:100%;display:block;border-radius:14px;}
.ita > .naiyou{position:absolute;left:0;top:0;transform-origin:0 0;}
.mk-waku{position:absolute;border:4px solid ${IRO.shirushi};border-radius:10px;box-shadow:0 0 0 6px rgba(224,138,30,.18);box-sizing:border-box;}
.mk-sen{position:absolute;height:8px;background:${IRO.shirushi};border-radius:4px;}
.label{position:absolute;font-size:30px;line-height:1.3;color:${IRO.label};white-space:nowrap;}
.fuda-k{position:absolute;font-size:44px;font-weight:700;background:${IRO.ao};color:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(20,35,55,.2);padding:16px 28px;white-space:nowrap;line-height:1.3;}
</style></head><body><div id="f"><div id="naka"></div><div id="ue"><div id="fuda"></div><div id="kukan"></div></div><div id="chuui"></div><div id="jimaku"></div><div id="kakuu"></div><div id="zenmen"></div></div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nose = (el, s) => { el.textContent = s || ''; el.classList.toggle('hide', !s); };
const CI = ${JSON.stringify(CI)};
const LABEL_H = ${LABEL_H};
// 白い板を置く。box の中に contain（o.ueSoroe なら上揃え）。o.waku／o.sen：画像の座標の四角（印は 1 つまで）。戻り値は { sc, x, y, w, h }
function ita(parent, g, box, o = {}) {
  const sc = Math.min(box.w / g.w, box.h / g.h);
  const w = g.w * sc, h = g.h * sc;
  const x = box.x + (box.w - w) / 2, y = o.ueSoroe ? box.y : box.y + (box.h - h) / 2;
  const d = document.createElement('div');
  d.className = 'ita';
  Object.assign(d.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  const img = document.createElement('img');
  img.src = g.src;
  d.appendChild(img);
  const waku = (o.waku || []).slice(0, 1), sen = o.waku && o.waku.length ? [] : (o.sen || []);
  for (const r of waku) {
    const m = document.createElement('div'); m.className = 'mk-waku';
    Object.assign(m.style, { left: r.x * sc - 10 + 'px', top: r.y * sc - 8 + 'px', width: r.w * sc + 20 + 'px', height: r.h * sc + 16 + 'px' });
    d.appendChild(m);
  }
  for (const r of sen) {
    const m = document.createElement('div'); m.className = 'mk-sen';
    Object.assign(m.style, { left: r.x * sc + 'px', top: (r.y + r.h) * sc + 2 + 'px', width: r.w * sc + 'px' });
    d.appendChild(m);
  }
  parent.appendChild(d);
  waits.push(img.decode());
  return { sc, x, y, w, h };
}
function label(parent, text, x, y, w, align = 'center') {
  const l = document.createElement('div'); l.className = 'label';
  Object.assign(l.style, { left: x + 'px', top: y + 'px', width: w + 'px', textAlign: align });
  l.textContent = text;
  parent.appendChild(l);
}
let waits = [];
window.kaku = async (s) => {
  waits = [];
  nose($('fuda'), s.fuda);
  nose($('kukan'), s.kukan);
  $('ue').classList.toggle('hide', !s.fuda && !s.kukan);
  $('jimaku').innerHTML = (s.jimaku || []).map((l) => '<div>' + esc(l) + '</div>').join('');
  // 注意書き：1 項目 1 行。3 項目以上は 2 行目に続けて並べる（2 行まで）。2 行なら上へ
  const cl = s.chuui || [];
  const gyou = cl.length > 2 ? [cl[0], cl.slice(1).join('　')] : cl;
  $('chuui').innerHTML = gyou.map((l) => '<div>' + esc(l) + '</div>').join('');
  $('chuui').style.top = (gyou.length > 1 ? ${CHUUI_UE - 10} : ${CHUUI_UE}) + 'px';
  nose($('kakuu'), s.kakuu);
  const naka = $('naka');
  naka.innerHTML = '';
  naka.style.transform = s.zoom ? 'scale(' + s.zoom + ')' : '';
  $('zenmen').style.display = 'none';
  const e = s.pic;
  let sc = null;
  if (e.k === 'ita') {
    // 1 枚の板：板を置く領域に contain。上にラベル（30px）を置くときは、その分を空ける
    const ueH = e.ue ? LABEL_H + 12 : 0;
    const box = { x: CI.x, y: CI.y + ueH, w: CI.w, h: CI.h - ueH };
    const sc0 = Math.min(box.w / e.g.w, box.h / e.g.h);
    const gh = e.g.h * sc0 + ueH;
    const r = ita(naka, e.g, { x: box.x, y: CI.y + (CI.h - gh) / 2 + ueH, w: box.w, h: e.g.h * sc0 }, e.o || {});
    if (e.ue) label(naka, e.ue, e.ueHidari ? r.x : CI.x, r.y - LABEL_H - 12, e.ueHidari ? 1200 : CI.w, e.ueHidari ? 'left' : 'center');
    sc = r.sc;
  }
  if (e.k === 'narabe') {
    // 2 枚：各列 幅 840・間 80・高さ 710 まで。上端をそろえ、ラベルは列の上に 30px。グループとして中身の領域の中央
    const COL = 840, GAP = 80, HMAX = 710;
    const scs = e.items.map((it) => Math.min(COL / it.g.w, HMAX / it.g.h));
    const hs = e.items.map((it, i) => it.g.h * scs[i]);
    const soeH = e.items.some((it) => it.soe) ? 12 + LABEL_H : 0;
    const gh = LABEL_H + 12 + Math.max(...hs) + soeH;
    const top = CI.y + (CI.h - gh) / 2 + LABEL_H + 12;
    e.items.forEach((it, i) => {
      const x = CI.x + i * (COL + GAP);
      const r = ita(naka, it.g, { x, y: top, w: COL, h: hs[i] }, { ...(it.o || {}), ueSoroe: true });
      label(naka, it.label, x, top - LABEL_H - 12, COL);
      if (it.soe) label(naka, it.soe, x, top + r.h + 12, COL);
    });
    sc = scs[0];
  }
  if (e.k === 'cardfuda') {
    // カード＋工夫の札：札はカードの右 64px・カードの上下中央にそろえて縦に（間 24）。t：0＝カードだけ中央、1＝カードと札のグループを中央
    const sc0 = Math.min(CI.w / e.g.w, (CI.h - 20) / e.g.h);
    const cw = e.g.w * sc0, ch = e.g.h * sc0;
    const fudas = (e.fudaAll || []).map((t) => { const f = document.createElement('div'); f.className = 'fuda-k'; f.textContent = t; f.style.visibility = 'hidden'; naka.appendChild(f); return f; });
    const fw = Math.max(0, ...fudas.map((f) => f.offsetWidth));
    const fh = fudas.reduce((a, f) => a + f.offsetHeight, 0) + 24 * Math.max(0, fudas.length - 1);
    const x0 = CI.x + (CI.w - cw) / 2, x1 = CI.x + (CI.w - (cw + 64 + fw)) / 2;
    const x = x0 + (x1 - x0) * (e.t || 0);
    const y = CI.y + (CI.h - ch) / 2;
    const r = ita(naka, e.g, { x, y, w: cw, h: ch }, e.o || {});
    let fy = y + (ch - fh) / 2;
    fudas.forEach((f, i) => {
      Object.assign(f.style, { left: x + cw + 64 + 'px', top: fy + 'px', visibility: (e.fuda || []).includes(e.fudaAll[i]) ? 'visible' : 'hidden' });
      fy += f.offsetHeight + 24;
    });
    sc = r.sc;
  }
  if (e.k === 'svg') {
    // 起・承・結の絵：中身の領域に、地と同じ色で描く（板にしない）
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', left: ${C.x} + 'px', top: ${C.y} + 'px' });
    d.innerHTML = e.html;
    naka.appendChild(d);
    for (const im of d.querySelectorAll('img')) waits.push(im.decode());
  }
  if (e.k === 'zenmen') {
    const z = $('zenmen');
    z.style.display = 'block';
    z.innerHTML = e.html;
  }
  await Promise.all(waits);
  await document.fonts.ready;
  // 注意書き・字幕が板に重なっていないか・注意書きが 1 行に入るか
  const ch = $('chuui');
  const itaSoko = Math.max(0, ...[...naka.querySelectorAll('.ita,.fuda-k,.label')].map((x) => x.getBoundingClientRect().bottom));
  const kasanari = ch.childElementCount ? ch.getBoundingClientRect().top < itaSoko : false;
  const hamidashi = [...ch.children].some((d) => d.scrollWidth > ch.clientWidth);
  const obiKasanari = (s.jimaku || []).length > 0 && $('jimaku').getBoundingClientRect().top < (ch.childElementCount ? ch.getBoundingClientRect().bottom : itaSoko);
  // 32便：絵の区間の字の大きさ（札を除く、いちばん小さい字）と、行数の上限（data-gyou）
  let minPx = null, gyouKoe = [];
  if (e.k === 'svg') {
    const tw = document.createTreeWalker(naka, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest('[data-fuda]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || el.getBoundingClientRect().width === 0) continue;
      const px = parseFloat(cs.fontSize);
      if (minPx == null || px < minPx) minPx = px;
    }
    for (const el of naka.querySelectorAll('[data-gyou]')) {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight);
      const n = Math.round((el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth)) / lh);
      if (n > Number(el.dataset.gyou)) gyouKoe.push(el.textContent.slice(0, 20) + '…（' + n + ' 行）');
    }
  }
  return { sc, kasanari, hamidashi, obiKasanari, minPx, gyouKoe };
};
</script></body></html>`;

const minPxOf = new Map(); // 32便：場面ごとのいちばん小さい字（札を除く）
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
      if (kk.kasanari || kk.obiKasanari) throw new Error(`注意書きか字幕が、板に重なりました（${key}・${s.pic.k}${s.pic.g ? '・' + s.pic.g.name : ''}）`);
      if (kk.hamidashi) throw new Error(`注意書きが 1 行に入りません：${(s.chuui || []).join('／')}`);
      if (kk.gyouKoe.length) throw new Error(`行数の上限を越えました：${kk.gyouKoe.join('／')}`);
      if (s.pic.na) minPxOf.set(s.pic.na, Math.min(minPxOf.get(s.pic.na) ?? 999, kk.minPx ?? 999));
      await page.screenshot({ path: file });
      files.set(key, file);
      bairitsu.set(key, kk.sc);
    }
  } finally {
    await browser.close();
  }
  return { fileOf: (s) => files.get(keyOf(s)), scOf: (s) => bairitsu.get(keyOf(s)) };
}

// ---- 起・承・結の絵（道具で描く SVG。中身の領域 1760×758 の大きさ・地は #E4E8EC）
const W = C.w, H = C.h;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="BIZ UDPGothic, sans-serif">${body}</svg>`;
const ORANGE = IRO.shirushi;
// 灯る点の順（散らす。決まった順で、毎回同じ）
const TEN_JUN = (() => { const a = Array.from({ length: 100 }, (_, i) => i); let x = 7; for (let i = 99; i > 0; i--) { x = (x * 1103515245 + 12345) % 2147483648; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
// 31便：絵の区間も中身の領域（1760×758）いっぱいに。絵と字をひとかたまりにして領域の中央に置く。
// ゆっくり 1.03 倍に寄っても中身の領域から出ないよう、上下 12px の内側に収める
const TEN = { d: 48, gap: 16 }; // 点の直径・間（1 辺 624px）
const TEN_HEN = 10 * TEN.d + 9 * TEN.gap;
const KI_SUUJI_W = 640; // 右の数字の列のおよその幅（「100 人に 19 人」240px／64px）
// 100 人の点（10×10）。iro：灯る点の数。kazu：右の数（null で出さない）。ue：上の「PISA 2025　国際学力調査」（0 秒から出す）。otona：3 文目の「10 人に 1 人」
function hyakuNin({ iro = 0, kazu = null, ue = true, otona = false }) {
  const lit = new Set(TEN_JUN.slice(0, iro));
  const gw = TEN_HEN + 120 + KI_SUUJI_W;
  const x0 = (W - gw) / 2;
  const labelH = 44 + 24;
  const y0 = (H - (TEN_HEN + labelH)) / 2 + labelH;
  const dots = [];
  for (let i = 0; i < 100; i++) dots.push(`<circle cx="${x0 + TEN.d / 2 + (i % 10) * (TEN.d + TEN.gap)}" cy="${y0 + TEN.d / 2 + Math.floor(i / 10) * (TEN.d + TEN.gap)}" r="${TEN.d / 2}" fill="${lit.has(i) ? ORANGE : IRO.ten}"/>`);
  const u = ue ? `<text x="${x0}" y="${y0 - 24 - 8}" font-size="44" font-weight="700" fill="${IRO.midashi}">${KASANE.ki.ue}</text>` : '';
  const tx = x0 + TEN_HEN + 120, ty = y0 + TEN_HEN / 2 + 80;
  const suuji = (mae, kazu2, ato) => `<text x="${tx}" y="${ty}" font-size="64" fill="${IRO.midashi}">${mae} <tspan font-size="240" font-weight="700" fill="${IRO.suuji}">${kazu2}</tspan> ${ato}</text>`;
  const k = kazu != null ? suuji(KASANE.ki.hito[0], kazu, KASANE.ki.hito[1]) : otona ? suuji(KASANE.ki.otona[0], KASANE.ki.otona[1], KASANE.ki.otona[2]) : '';
  return svg(u + dots.join('') + k);
}
// 教室（黒板 1 本・5 行×7 列＝35 席）。灯す 7 席は散らす（台本 §1）。31便：1 席 136×88・間 20（幅 1072・高さ 520）・黒板 560×24（席の上 40px）
const NANA = [[1, 2], [2, 5], [3, 1], [3, 6], [4, 3], [5, 4], [5, 7]];
const SEKI = { w: 136, h: 88, gx: 20, gy: 20 };
const KW = 7 * SEKI.w + 6 * SEKI.gx;
const KH = 5 * SEKI.h + 4 * SEKI.gy;
const KOKU = { w: 560, h: 24, aida: 40 };
const KYOU_Y0 = (H - (KOKU.h + KOKU.aida + KH)) / 2 + KOKU.h + KOKU.aida; // 席の上端（黒板と席のかたまりを上下の中央に）
const KYOU_SUUJI_W = 470; // 右の数字の列のおよその幅（128px／72px）
const KYOU_X_MIGI = (W - (KW + 100 + KYOU_SUUJI_W)) / 2; // 教室＋右の数字のかたまりを中央に
const KYOU_X_NAKA = (W - KW) / 2; // 教室だけを中央に
const sekiNoBasho = (x0, y0, r, c) => ({ x: x0 + (c - 1) * (SEKI.w + SEKI.gx), y: y0 + (r - 1) * (SEKI.h + SEKI.gy) });
const sekiRect = (x, y, lit, w = SEKI.w, h = SEKI.h, rx = 10) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${lit ? ORANGE : '#FFFFFF'}" stroke="${lit ? ORANGE : IRO.sen}" stroke-width="2"/>`;
const kokuban = (x0, y0) => `<rect x="${x0 + (KW - KOKU.w) / 2}" y="${y0 - KOKU.aida - KOKU.h}" width="${KOKU.w}" height="${KOKU.h}" rx="5" fill="${IRO.label}"/>`;
function kyoushitsu({ x0, y0 = KYOU_Y0, tomoru = 0, cards = 0, migi = false }) {
  const lit = NANA.slice(0, tomoru).map(([r, c]) => `${r}-${c}`);
  const parts = [kokuban(x0, y0)];
  let n = 0;
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 7; c++) {
    const { x, y } = sekiNoBasho(x0, y0, r, c);
    parts.push(sekiRect(x, y, lit.includes(`${r}-${c}`)));
    // 31便：結のカードは席いっぱい 112×68・上に 8px の帯 #2F6F8F・線 1.5px #55606B
    if (n < cards) {
      const cx = x + (SEKI.w - 112) / 2, cy = y + (SEKI.h - 68) / 2;
      parts.push(`<rect x="${cx}" y="${cy}" width="112" height="68" rx="6" fill="#FFFFFF" stroke="${IRO.label}" stroke-width="1.5"/><path d="M${cx + 0.75} ${cy + 6.75}a6 6 0 0 1 6-6h98.5a6 6 0 0 1 6 6v2h-110.5z" fill="${IRO.ao}"/>`);
    }
    n++;
  }
  if (migi) {
    const tx = x0 + KW + 100;
    parts.push(`<text x="${tx}" y="${y0 + 150}" font-size="128" font-weight="700" fill="${IRO.suuji}">${KASANE.ki.kyoushitsu[0]}</text>`);
    parts.push(`<text x="${tx}" y="${y0 + 300}" font-size="128" font-weight="700" fill="${IRO.suuji}">${KASANE.ki.kyoushitsu[1]}</text>`);
    parts.push(`<text x="${tx}" y="${y0 + 410}" font-size="72" fill="${IRO.midashi}">${KASANE.ki.kyoushitsu[2]}</text>`);
  }
  return svg(parts.join(''));
}
// 承：起の教室の続き。p：1 席が残って大きくなる進み（0〜1）。gyou：出ている行の数。fade：いちばん新しい行の現れ方（0〜1）
// 31便：席の絵は約 300×200、文の列を右に。席と文をひとかたまりにして、中身の領域の上下・左右の中央に
const SHO_SEKI = [3, 6];
// 32便：席の線画 420×280・現在の行 72px 太・過去の行 60px・行の間 32px（先生 16:10「全体的に大きく」）
const SHO_TO = { w: 420, h: 280 };
const SHO_BUN_W = 1224; // 文の列のおよその幅（いちばん長い行「『困ったら言ってね』では届かない。」72px）
const SHO_GAP = 60;
const SHO_X = (W - (SHO_TO.w + SHO_GAP + SHO_BUN_W)) / 2;
const SHO_PX = { ima: 72, mae: 60, aida: 32 };
function shoNoE({ p = 0, gyou = 0, fade = 1 }) {
  const x0 = KYOU_X_NAKA, y0 = KYOU_Y0;
  const e = (t) => 1 - (1 - t) * (1 - t); // なめらかに
  const q = e(p);
  const parts = [`<g opacity="${(1 - q).toFixed(3)}">${kokuban(x0, y0)}`];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 7; c++) {
    if (r === SHO_SEKI[0] && c === SHO_SEKI[1]) continue;
    const { x, y } = sekiNoBasho(x0, y0, r, c);
    parts.push(sekiRect(x, y, NANA.some(([a, b]) => a === r && b === c)));
  }
  parts.push('</g>');
  const s = sekiNoBasho(x0, y0, ...SHO_SEKI);
  const to = { x: SHO_X, y: (H - SHO_TO.h) / 2, w: SHO_TO.w, h: SHO_TO.h };
  const lerp = (a, b) => a + (b - a) * q;
  parts.push(`<rect x="${lerp(s.x, to.x)}" y="${lerp(s.y, to.y)}" width="${lerp(SEKI.w, to.w)}" height="${lerp(SEKI.h, to.h)}" rx="${lerp(10, 24)}" fill="${ORANGE}"/>`);
  // 文ごとに席の中の小さな絵（線画・1 色・文字なし）
  if (q >= 1 && gyou > 0) parts.push(`<g transform="translate(${to.x + to.w / 2} ${to.y + to.h / 2}) scale(1.8) translate(${-(to.x + to.w / 2)} ${-(to.y + to.h / 2)})">${sekiNoE(Math.min(gyou, 4), to)}</g>`);
  // 文：現在行 72px 太・過去行 60px・行の間 32px。5 行のかたまりを上下の中央に
  const tx = to.x + to.w + SHO_GAP;
  const gyouH = (i) => (i === gyou - 1 ? SHO_PX.ima : SHO_PX.mae);
  let y = (H - (SHO_PX.ima + 4 * SHO_PX.mae + 4 * SHO_PX.aida)) / 2;
  for (let i = 0; i < gyou; i++) {
    const ima = i === gyou - 1;
    const a = ima ? fade : 1;
    y += gyouH(i);
    parts.push(`<text x="${tx}" y="${y + (ima ? 12 * (1 - a) : 0)}" font-size="${ima ? SHO_PX.ima : SHO_PX.mae}" font-weight="${ima ? 700 : 400}" fill="${ima ? IRO.midashi : IRO.label}" opacity="${a.toFixed(3)}">${KASANE.sho[i]}</text>`);
    y += SHO_PX.aida;
  }
  return svg(parts.join(''));
}
// 承の席の中の絵（線画・1 色 #3E4A56・文字なし）。1：白いノート（空欄）／2：本と時計／3：「？」の吹き出し／4：「！」の吹き出し
function sekiNoE(n, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const L = IRO.fudaJi;
  const st = `fill="none" stroke="${L}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const fuki = `<path d="M${cx - 62} ${cy - 50}h124a14 14 0 0 1 14 14v62a14 14 0 0 1-14 14h-70l-26 22v-22h-28a14 14 0 0 1-14-14v-62a14 14 0 0 1 14-14z" ${st} fill="#FFFFFF"/>`;
  if (n === 1) return `<rect x="${cx - 46}" y="${cy - 58}" width="92" height="116" rx="6" fill="#FFFFFF" stroke="${L}" stroke-width="5"/><path d="M${cx - 30} ${cy - 58}v116" ${st}/>`;
  if (n === 2) return `<path d="M${cx - 96} ${cy - 30}q36-16 60 0v74q-24-16-60 0z M${cx - 36} ${cy - 30}q24-16 60 0v74q-36-16-60 0z" ${st} fill="#FFFFFF"/><circle cx="${cx + 62}" cy="${cy + 4}" r="36" ${st} fill="#FFFFFF"/><path d="M${cx + 62} ${cy - 18}v22l16 12" ${st}/>`;
  if (n === 3) return fuki + `<path d="M${cx - 16} ${cy - 22}a16 16 0 1 1 22 15q-6 3-6 10v6" ${st}/><circle cx="${cx}" cy="${cy + 26}" r="4" fill="${L}"/>`;
  return fuki + `<path d="M${cx} ${cy - 32}v40" ${st}/><circle cx="${cx}" cy="${cy + 26}" r="4" fill="${L}"/>`;
}

// ---- 32便：画面の区間を「絵」で見せる（資料 37 第4版 §2-9）。1 コマ 1 主役・字は大きく・順に出る。
// 絵の中の言葉は、声の文の言葉か、アプリの本物の文（public/data と資料 31）だけ。HTML で中身の領域（1760×758）に組む
const BAN = 'background:#fff;border-radius:14px;box-shadow:0 0 0 1px rgba(31,41,51,.12),0 18px 48px rgba(20,35,55,.22);box-sizing:border-box;';
const FUDA_S = `display:inline-block;font-size:36px;line-height:1.3;color:${IRO.fudaJi};border:1.5px solid ${IRO.sen};border-radius:999px;padding:4px 22px;background:#fff;`;
const WAKU_S = `border:4px solid ${IRO.shirushi};border-radius:10px;box-shadow:0 0 0 6px rgba(224,138,30,.18);`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 中身の領域いっぱいの入れ物（中は上下・左右の中央）
const naka = (inner, x = '') => `<div style="width:${W}px;height:${H}px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'BIZ UDPGothic',sans-serif;color:${IRO.midashi};${x}">${inner}</div>`;
const fuda = (t) => `<span data-fuda="1" style="${FUDA_S}">${esc(t)}</span>`;
const op = (o) => (o == null || o >= 1 ? '' : `opacity:${o.toFixed(3)};`);
const fadeKoma = (mk) => Array.from({ length: 4 }, (_, i) => [mk((i + 1) / 4), i < 3 ? 0.25 / 4 : 0]);
const yukkuri = (x) => 1 - (1 - x) ** 3;

// 本物の値を読む（手で書かない）
function honmono() {
  const j = (p) => JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', p), 'utf8'));
  const demo = j('demo.json'), hozon = j('demo_claude.json'), cn = j('card_namae.json'), cards = j('cards.json'), tana = j('tana.json');
  const k1 = hozon.文['デモ1'];
  const kotae = kotaeD(demo.結果['デモ1'].kai[0], tana);
  const D1 = tana.D.質問.D1;
  const kiroku = JSON.parse(readFileSync(KIROKU, 'utf8'));
  const keiBun = hozon.文['__クラス__'].keikaku.ko[0].bun;
  const keikakuBun = keiBun.slice(keiBun.indexOf('週2回'));
  const kirokuBun = kiroku.erabi.filter((e) => e.dare === 'claude').map((e) => e.riyuu).find((r) => r.startsWith('さっきは聞いて答えたので'));
  if (!kirokuBun) throw new Error('資料 31 に「さっきは聞いて答えたので…」の Claude の行がありません');
  const tsugi = k1.kasetsu.tsugi;
  const kobetsu = kobetsuNoKu(tsugi);
  const ichibun = k1.tsutae.kondan.split('。')[0] + '。';
  const kaisu = kotae.find((d) => d.id === 'D4')?.kotae;
  const mA = matome({ ...demo.結果['デモ1'].kai[0], kai: 1 }, 'A');
  if (!mA.yomu.length || !mA.kiku.length) throw new Error('デモ1 の 1 回目の読む／聞くの結果が読めません');
  return {
    ikkaime: [['読む', `${mA.yomu[0]}／${mA.kazu}`], ['聞く', `${mA.kiku[0]}／${mA.kazu}`]],
    kasetsu: k1.kasetsu.kasetsu,
    kotae: kotae.filter((d) => ['D1', 'D2'].includes(d.id)).map((d) => d.kotae),
    sonomama: kaisu,
    kobetsu,
    kirokuBun,
    keikakuBun,
    ichibun,
    shitsumon: { toi: D1.問い, kotae: D1.選択肢.slice(0, 4), erabu: kotae.find((d) => d.id === 'D1').kotae },
    hachinin: demo.クラス.map((k) => {
      const c = hozon.文[k.id]?.kasetsu?.card;
      if (!c) throw new Error(`${k.id} の保存した仮説にカードがありません`);
      return { namae: k.名前, card: cn.名前[c], iro: cards.カード[c]?.色 || IRO.ao };
    }),
  };
}

// 深さ-2 の右の句：保存した「次に試すなら」の文から、こちらから声をかける句を選ぶ（39便：11/4 の文と 11/8 に取り直した文の両方）
function kobetsuNoKu(tsugi) {
  const KOUHO = ['こちらから個別に声をかけて確かめる', 'こちらから声をかけて口で答えてもらう'];
  const k = KOUHO.find((x) => tsugi.includes(x));
  if (!k) throw new Error(`保存した「次に試すなら」に、こちらから声をかける句がありません：${tsugi}`);
  return k;
}

// 質問の板（本物：tana.json の D1 の問いと答え 4 つ）。erabu：橙の枠を付ける答え
function shitsumonBan(H0, erabu = null) {
  const s = H0.shitsumon;
  const kotae = s.kotae.map((k) => `<div style="flex:0 0 calc(50% - 12px);box-sizing:border-box;padding:22px 28px;font-size:48px;line-height:1.3;border:2px solid #9a9484;border-radius:14px;background:#fff;${erabu && k === erabu ? WAKU_S : ''}">${esc(k)}</div>`).join('');
  return naka(`<div style="${BAN}width:1700px;padding:40px 48px;background:#F7F5EF">
    <div style="font-size:72px;font-weight:700;margin-bottom:32px">${esc(s.toi)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:24px">${kotae}</div></div>`);
}

// 承：s5 ①「こちらからたずねる」＝吹き出しの線画（幅 420）
function fukidashi() {
  const w = 672, h = 480; // 32便：幅か高さの 6 割以上（高さ 480＝63%）
  const st = `fill="#fff" stroke="${IRO.fudaJi}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"`;
  return naka(`<svg width="${w}" height="${h}" viewBox="0 0 420 300"><path d="M30 20h360a24 24 0 0 1 24 24v170a24 24 0 0 1-24 24H170l-70 52v-52H30a24 24 0 0 1-24-24V44a24 24 0 0 1 24-24z" ${st}/>
    <path d="M178 92a32 32 0 1 1 44 30q-12 6-12 20v12" fill="none" stroke="${IRO.fudaJi}" stroke-width="10" stroke-linecap="round"/><circle cx="210" cy="190" r="8" fill="${IRO.fudaJi}"/></svg>`);
}
// 承：s5 ③ 題名「チカラのスイッチ」128px と、左から引かれる橙の線（8px）
function daimei(t) {
  return naka(`<div style="display:inline-block"><div style="font-size:136px;font-weight:700;color:${IRO.midashi};line-height:1.2">${esc(KASANE.saigo[0])}</div>
    <div style="height:8px;border-radius:4px;background:${IRO.shirushi};width:${(t * 100).toFixed(1)}%;margin-top:18px"></div></div>`);
}

// 転A：s0「同じ問題」の板と、3 段の「読む｜聞く」「文｜図」「一気に｜区切って」
const DAN3 = [['読む', '聞く'], ['文', '図'], ['一気に読む', '区切って読む']];
function onajiMondai({ ue = 0, dan = 0, fade = 1 }) {
  // ue：板が上へ滑る進み（0〜1。1 で消える）。dan：出ている段の数。fade：いちばん新しい段の現れ方
  const ban = ue < 1 ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,calc(-50% - ${yukkuri(ue) * 520}px));${op(1 - yukkuri(ue))}${BAN}width:1100px;height:320px;display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:700">同じ問題</div>` : '';
  const rows = DAN3.slice(0, dan).map((r, i) => `<div style="display:flex;gap:80px;${i === dan - 1 ? op(fade) : ''}">${r.map((t) => `<div style="${BAN}width:840px;height:200px;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:700">${t}</div>`).join('')}</div>`).join('');
  return naka(`${ban}<div style="display:flex;flex-direction:column;gap:24px">${rows}</div>`);
}
// 転A：s1「四十五分で、二十二問」＝45 分・22 問と、22 個の点が灯る
function yonjuugo(iro) {
  const dots = Array.from({ length: 22 }, (_, i) => `<div style="width:40px;height:40px;border-radius:50%;background:${i < iro ? ORANGE : IRO.ten}"></div>`).join('');
  const kazu = (n, t) => `<span style="font-size:240px;font-weight:700;color:${IRO.suuji};line-height:1">${n}</span><span style="font-size:64px;margin:0 60px 0 16px">${t}</span>`;
  return naka(`<div style="display:flex;align-items:baseline">${kazu('45', '分')}${kazu('22', '問')}</div><div style="display:flex;gap:16px;margin-top:60px">${dots}</div>`);
}

// 転B：s0 左「比べた結果」（表の写し）｜右「本人が選んだ答え」（本物の 2 つ・48px）
function kurabeHidari(G) {
  const g = G.d1_hyou;
  const sc = Math.min(1100 / g.w, 600 / g.h);
  return naka(`<div style="width:${g.w * sc}px"><div style="font-size:44px;font-weight:700;margin-bottom:16px">比べた結果</div><div style="${BAN}width:${g.w * sc}px;height:${g.h * sc}px;overflow:hidden"><img src="${pathToFileURL(g.file).href}" style="width:100%;height:100%;display:block;border-radius:14px"></div></div>`);
}
function kurabetaKekka(G, H0, migi) {
  const g = G.d1_hyou;
  const sc = Math.min(840 / g.w, 560 / g.h);
  const lab = (t) => `<div style="font-size:44px;font-weight:700;margin-bottom:16px">${t}</div>`;
  const hidari = `<div style="width:840px">${lab('比べた結果')}<div style="${BAN}width:${g.w * sc}px;height:${g.h * sc}px;overflow:hidden"><img src="${pathToFileURL(g.file).href}" style="width:100%;height:100%;display:block;border-radius:14px"></div></div>`;
  const m = `<div style="width:840px;${op(migi)}">${lab('本人が選んだ答え')}<div style="${BAN}padding:36px 40px">${H0.kotae.map((k) => `<div style="font-size:48px;line-height:1.4;margin:10px 0">「${esc(k)}」</div>`).join('')}</div></div>`;
  return naka(`<div style="display:flex;gap:80px;align-items:flex-start">${hidari}${migi > 0 ? m : '<div style="width:840px"></div>'}</div>`);
}
// Claude の文の板：札「Claude（AI）が書いた」＋（札）＋本物の 1 文。waku：橙の枠
function claudeBan(bun, { px = 64, chip = '', waku = true, gyou = 2, w = 1600 } = {}) {
  return naka(`<div style="${BAN}width:${w}px;padding:44px 56px">
    <div style="display:flex;gap:16px;margin-bottom:28px">${fuda('Claude（AI）が書いた')}${chip ? fuda(chip) : ''}</div>
    <div data-gyou="${gyou}" style="font-size:${px}px;font-weight:700;line-height:1.4;padding:10px 18px;${waku ? WAKU_S : ''}">${esc(bun)}</div></div>`);
}
// 転B：「決めるのは先生です」＝1 語の書きかえ（本物の下書きの 1 文を 56px で組む）
function kakikae(H0, mae, ato, jou) {
  // jou：mae（下線）／sentaku（選択）／k0..kn（打ち直し中・カーソル）／ato（下線）
  const i = H0.ichibun.indexOf(mae);
  if (i < 0) throw new Error(`下書きの 1 文目に「${mae}」がありません`);
  const a = H0.ichibun.slice(0, i), b = H0.ichibun.slice(i + mae.length);
  const sen = `border-bottom:8px solid ${IRO.shirushi};`;
  let go;
  if (jou === 'mae') go = `<span style="${sen}">${mae}</span>`;
  else if (jou === 'sentaku') go = `<span style="background:#B9D4EA">${mae}</span>`;
  else if (jou === 'ato') go = `<span style="${sen}">${ato}</span>`;
  else { const n = Number(jou.slice(1)); go = `${ato.slice(0, n)}<span style="display:inline-block;width:4px;height:1.1em;background:${IRO.jimaku};vertical-align:-0.15em"></span>`; }
  return naka(`<div style="text-align:center;margin-bottom:24px">${fuda(KASANE.kakinaosu)}</div>
    <div style="${BAN}width:1700px;padding:40px 48px"><div data-gyou="2" style="font-size:56px;line-height:1.5">${esc(a)}${go}${esc(b)}</div></div>`);
}
// 転B：s1 左＝仮説（56px）→ 矢印と「根拠つき」→ 右＝「大事な連絡は、口でも伝える」（64px 太）
function konkyoTsuki(H0, n) {
  const hidari = `<div style="${BAN}width:760px;padding:32px 40px"><div style="margin-bottom:18px">${fuda('Claude（AI）が書いた')}</div><div data-gyou="3" style="font-size:56px;font-weight:700;line-height:1.4">${esc(H0.kasetsu)}</div></div>`;
  const ya = `<div style="width:200px;text-align:center;${n >= 2 ? '' : 'visibility:hidden;'}"><svg width="150" height="60" viewBox="0 0 150 60"><path d="M8 30h118M100 8l26 22-26 22" fill="none" stroke="${IRO.fudaJi}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg><div style="font-size:44px;font-weight:700;color:${IRO.fudaJi}">根拠つき</div></div>`;
  const migi = `<div style="${BAN}width:760px;padding:40px 44px;${n >= 3 ? '' : 'visibility:hidden;'}"><div data-gyou="2" style="font-size:64px;font-weight:700;line-height:1.35">大事な連絡は、口でも伝える</div></div>`;
  return naka(`<div style="display:flex;align-items:center;gap:20px">${hidari}${ya}${migi}</div>`);
}
// 転B：s2 8 人の名前とカードの題名（2 段×4 列・各 410×300）。n：出ている人数
function hachinin(H0, n) {
  const ita = H0.hachinin.map((k, i) => `<div style="${BAN}width:410px;height:300px;overflow:hidden;display:flex;flex-direction:column;${i < n ? '' : 'visibility:hidden;'}">
    <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:700">${esc(k.namae)}</div>
    <div style="height:110px;background:${k.iro};color:#fff;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700">${esc(k.card)}</div></div>`).join('');
  return naka(`<div style="display:grid;grid-template-columns:repeat(4,410px);gap:40px">${ita}</div>`);
}
// 転B：s3 文字だけの 1 枚（112px 太）
function hitoriHitori(n, fade = 1) {
  const g = [['一人一人に', IRO.midashi], ['支援が行き渡る', IRO.midashi], ['そのきっかけ', IRO.suuji]];
  return naka(g.map(([t, c], i) => `<div style="font-size:112px;font-weight:700;line-height:1.4;color:${c};${i < n ? (i === n - 1 ? op(fade) : '') : 'visibility:hidden;'}">${t}</div>`).join(''));
}
// 深さ：s0「測る問題」の板 3 枚＋札「Claude」＋橙の ✕（t：線を引く進み）。kawaru：「問題 A／B／C」と「？」に変わる進み
function hakaruMondai(t, kawaru = 0) {
  const ita = (i) => `<div style="${BAN}width:440px;height:200px;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:700;position:relative">
    <span style="position:absolute;${op(1 - kawaru)}">測る問題</span><span style="position:absolute;${op(kawaru)}">問題 ${'ABC'[i]}</span></div>`;
  // 34便：✕は 1 本目（左上→右下）を引き切ってから、2 本目（右上→左下）も端まで引く。t＝0〜1 で 2 本ぶん（170×2）を進める。
  // 枠は 150px（札の高さ約 117px の 1.6 倍以内）
  const IPPON = 170; // 120√2 ≒ 169.7
  const L = 2 * IPPON * Math.min(1, Math.max(0, t));
  const sen1 = IPPON - Math.min(L, IPPON);
  const sen2 = IPPON - Math.max(0, Math.min(L - IPPON, IPPON));
  const batsu = `<svg width="150" height="150" viewBox="0 0 150 150" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)"><path d="M15 15l120 120" stroke="${IRO.shirushi}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${IPPON}" stroke-dashoffset="${sen1.toFixed(1)}"/><path d="M135 15l-120 120" stroke="${IRO.shirushi}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${IPPON}" stroke-dashoffset="${sen2.toFixed(1)}"/></svg>`;
  const claude = `<div style="position:relative;display:inline-block;margin-bottom:56px;${op(1 - kawaru)}"><div style="background:${IRO.ao};color:#fff;font-size:64px;font-weight:700;border-radius:14px;padding:20px 56px">Claude</div>${batsu}</div>`;
  const hatena = kawaru > 0 ? `<div style="${op(kawaru)}display:flex;flex-direction:column;align-items:center;margin-left:60px"><div style="font-size:240px;font-weight:700;color:${IRO.suuji};line-height:1">？</div><div style="font-size:72px;font-weight:700">何の差？</div></div>` : '';
  return naka(`${claude}<div style="display:flex;align-items:center"><div style="display:flex;gap:40px">${[0, 1, 2].map(ita).join('')}</div>${hatena}</div>`);
}
// 深さ：s1 左「Claude を使わないとき」｜右「Claude の下書き」（右だけ橙の枠）
function hidariMigi(H0, n) {
  const ita = (f, t, w) => `<div style="${BAN}width:840px;padding:36px 44px;min-height:330px"><div style="margin-bottom:24px">${fuda(f)}</div><div data-gyou="2" style="font-size:64px;font-weight:700;line-height:1.4;padding:8px 14px;${w ? WAKU_S : ''}">${esc(t)}</div></div>`;
  return naka(`<div style="display:flex;gap:80px;align-items:stretch">${ita(KASANE.kimatta, `「${H0.sonomama}」`, false)}<div style="${n >= 2 ? '' : 'visibility:hidden;'}">${ita(KASANE.claude, H0.kobetsu, true)}</div></div>`);
}
// 深さ：s2 左「先生に見える」＋仮説の 1 文（56px）｜右「本人に見える」＋スイッチカード（本物）
function mieru2(G, H0) {
  const g = G.card_d1_semai;
  const sc = Math.min(840 / g.w, 600 / g.h);
  return naka(`<div style="display:flex;gap:80px;align-items:center">
    <div style="width:840px"><div style="font-size:44px;font-weight:700;margin-bottom:16px">${KASANE.mieru[0]}</div><div style="${BAN}padding:36px 44px"><div style="margin-bottom:18px">${fuda('Claude（AI）が書いた')}</div><div data-gyou="2" style="font-size:56px;font-weight:700;line-height:1.4">${esc(H0.kasetsu)}</div></div></div>
    <div style="width:840px"><div style="font-size:44px;font-weight:700;margin-bottom:16px">${KASANE.mieru[1]}</div><div style="${BAN}width:${g.w * sc}px;height:${g.h * sc}px;overflow:hidden"><img src="${pathToFileURL(g.file).href}" style="width:100%;height:100%;display:block;border-radius:14px"></div></div></div>`);
}
// 深さ：s3（34便）デモ1 の 1 回目の実物の数字：左「読む」｜右「聞く」の板（数字 160px）→「一回や二回で、決めつけない」（96px・印 1 つ）。
// ita：板の現れ方（0〜1）・gyou：1 行の現れ方（0〜1。0 なら出さない）
function ichiNiKai(H0, ita, gyou = 0) {
  const ban = ([na, chi]) => `<div style="${BAN}width:600px;padding:36px 40px;text-align:center"><div style="font-size:64px;font-weight:700;line-height:1.3">${na}</div><div style="font-size:160px;font-weight:700;line-height:1.1;color:${IRO.suuji}">${esc(chi)}</div></div>`;
  return naka(`<div style="display:flex;gap:120px;${op(ita)}">${H0.ikkaime.map(ban).join('')}</div>
    <div data-gyou="1" style="margin-top:64px;font-size:96px;font-weight:700;line-height:1.3;padding:6px 28px;${WAKU_S}${gyou > 0 ? op(gyou) : 'visibility:hidden;'}">一回や二回で、決めつけない</div>`);
}

// ---- 区間ごとの絵の並び（台本 §1 の「画面」）。cue：s 文の番号（0 から）・at 文の中のかけら（その頭から）・plus 秒・pic 絵（seq は [絵, 秒] の並び）
// 30便：アプリの写しは、全画面・寄り・2-up・帯とも「白い板」（ita）。後ろに暗くした画面は置かない。印は 1 コマ 1 つ・#E08A1E

// ---- 第8版の新しい絵（先生の 11/8 10:03 の言葉。声の文の言葉だけを使う）
function miienai(n) {
  const rei = KASANE.sho.slice(0, 3).map((t) => `<div style="font-size:48px;line-height:1.5;color:${IRO.label}">${esc(t)}</div>`).join('');
  const dai = (t, c, vis) => `<div style="font-size:88px;font-weight:700;line-height:1.35;color:${c};${vis ? '' : 'visibility:hidden;'}">${t}</div>`;
  return naka(`<div style="${BAN}padding:28px 56px;margin-bottom:56px;background:#F7F5EF">${rei}</div>${dai('よく気づく先生にしか、見えない。', IRO.midashi, n >= 1)}${dai('本人だけでは、気づけない。', IRO.suuji, n >= 2)}${dai('小さいようで、大きな問題。', IRO.midashi, n >= 3)}`);
}
function kyouKo(n, t) {
  const x0 = KYOU_X_MIGI;
  let k = 0;
  const s0 = kyoushitsu({ x0 }).replace(new RegExp(`fill="#FFFFFF" stroke="${IRO.sen}"`, 'g'), (m) => (k++ < n ? `fill="${ORANGE}" stroke="${ORANGE}"` : m));
  const tx = x0 + KW + 100, y0 = KYOU_Y0;
  let b = `<text x="${tx}" y="${y0 + 150}" font-size="72" font-weight="700" fill="${IRO.midashi}">個に応じた</text><text x="${tx}" y="${y0 + 240}" font-size="72" font-weight="700" fill="${IRO.midashi}">最適な指導を</text>`;
  if (t >= 2) b += `<text x="${tx}" y="${y0 + 380}" font-size="72" font-weight="700" fill="${IRO.suuji}">それも、</text><text x="${tx}" y="${y0 + 470}" font-size="72" font-weight="700" fill="${IRO.suuji}">クラス全員に</text>`;
  return s0.replace('</svg>', b + '</svg>');
}
function reiRei(n) {
  const L = ['大事な連絡は、口でも伝える', '問題文を読んであげる'];
  return naka(`<div style="margin-bottom:40px">${fuda('指導のヒントの例')}</div><div style="display:flex;flex-direction:column;gap:36px;align-items:center">${L.map((t, i) => `<div style="${BAN}padding:36px 72px;font-size:84px;font-weight:700;${i < n ? '' : 'visibility:hidden;'}">${esc(t)}</div>`).join('')}</div>`);
}
function renkei(n) {
  const box = (t, i, last) => `<div style="${BAN}padding:24px 72px;font-size:84px;font-weight:700;${last ? WAKU_S : ''}${i < n ? '' : 'visibility:hidden;'}">${esc(t)}</div>`;
  const ya = (i) => `<svg width="60" height="56" viewBox="0 0 60 56" style="${i < n ? '' : 'visibility:hidden;'}"><path d="M30 6v40M12 30l18 20 18-20" fill="none" stroke="${IRO.fudaJi}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return naka(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${box('根拠', 0)}${ya(1)}${box('小さな工夫', 1)}${ya(2)}${box('生徒は安心して学べる', 2, true)}</div>`);
}
function anshin() {
  return naka(`<div style="${BAN}padding:36px 80px;font-size:96px;font-weight:700;${WAKU_S}">生徒は安心して学べる</div>`);
}
function rikai() {
  return naka(`<div style="display:flex;align-items:center;gap:56px"><div style="${BAN}padding:40px 64px;font-size:96px;font-weight:700">生徒への理解</div><svg width="150" height="60" viewBox="0 0 150 60"><path d="M8 30h118M100 8l26 22-26 22" fill="none" stroke="${IRO.fudaJi}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg><div style="${BAN}padding:40px 64px;font-size:96px;font-weight:700;${WAKU_S}">信頼関係</div></div>`);
}

function eNoNarabi(G) {
  const g = (name) => {
    const x = G[name];
    if (!x) throw new Error(`画面の写しがありません：${name}`);
    return { src: pathToFileURL(x.file).href, w: x.w, h: x.h, name, moji: x.moji };
  };
  const mk = (name, kinds) => Object.fromEntries(Object.entries(kinds).map(([k, m]) => [k, G[name].marks[m]]));
  const zen = (name, o = {}) => ({ k: 'ita', g: g(name), o });
  const kiri = (name, o = {}) => ({ k: 'ita', g: g(name), o, ue: o.ue || '', ueHidari: Boolean(o.ueHidari) });
  const S = (s) => ({ k: 'svg', html: s });
  const saigo = {
    k: 'zenmen',
    html: `<div style="position:relative;width:1920px;height:1080px;background:${JI};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;text-align:center">
      <div style="font-size:112px;font-weight:700;color:${IRO.midashi}">${KASANE.saigo[0]}</div>
      <div style="font-size:48px;color:${IRO.fudaJi}">${KASANE.saigo[1]}</div>
      <div style="font-size:36px;color:${IRO.label};margin-top:44px">${KASANE.saigo[2]}</div>
      <div style="font-size:40px;font-weight:700;color:${IRO.ao}">${KASANE.saigo[3]}</div>
      <div style="position:absolute;left:0;right:0;bottom:44px;font-size:22px;color:${IRO.label}">${KASANE.koeHyouji}</div></div>`,
  };
  const KO = KASANE.fuda.ko, SEN = KASANE.fuda.sensei;
  const H0 = honmono();
  G.honmono = H0;
  const B32 = (na, html) => ({ k: 'svg', html, na });
  // 承-6：教室の 35 席が全部灯る（起の教室と同じ大きさ・作り。中央に）
  const kyoushitsuZen = (n) => {
    const svg0 = kyoushitsu({ x0: KYOU_X_NAKA });
    let k = 0;
    return svg0.replace(new RegExp(`fill="#FFFFFF" stroke="${IRO.sen}"`, 'g'), (m) => (k++ < n ? `fill="${ORANGE}" stroke="${ORANGE}"` : m));
  };
  // 1 語の書きかえ：before 1.5 秒（下線）→ 選択 0.3 秒 → 消えて打ち直し 0.7 秒（1 字ずつ・カーソル点滅）→ after 1.5 秒（下線）
  // 30便：印は 1 色（#E08A1E）だけなので、before の下線も橙
  // 1 語の書きかえ：before 1.5 秒（下線）→ 選択 0.3 秒 → 消えて 1 字ずつ打ち直し 0.7 秒（カーソル）→ after 1.5 秒（下線）。32便：本物の下書きの 1 文を 56px で組む
  const kakikaeSeq = () => {
    const mae = G.kakikae.mae, ato = G.kakikae.ato;
    const k = (j) => B32('転B-1 書きかえ', kakikae(H0, mae, ato, j));
    const n = ato.length;
    const uchi = Array.from({ length: n + 1 }, (_, i) => [k(`k${i}`), 0.7 / (n + 1)]);
    return [[k('mae'), 1.5], [k('sentaku'), 0.3], ...uchi, [k('ato'), 1.5]];
  };
  const kyouSeq = (n0) => Array.from({ length: 8 }, (_, i) => [S(kyoushitsu({ x0: KYOU_X_MIGI, tomoru: n0 + i > 7 ? 7 : i, migi: true })), 0.12]);
  // 転A-4〜6 のカード（480 幅の写し）と工夫の札。横に滑る 400ms（ease-out・12 コマ）
  const cardAt = (t, fuda = [], o = {}) => ({ k: 'cardfuda', g: g('card_d1_semai'), t: Number(t.toFixed(4)), fuda, fudaAll: KASANE.kufuu, o });
  const easeOut = (x) => 1 - (1 - x) ** 3;
  const suberu = (a, b, fuda, o) => Array.from({ length: 12 }, (_, i) => [cardAt(a + (b - a) * easeOut((i + 1) / 12), fuda, o), i < 11 ? 1 / 30 : 0]);
  const fadeSeq = (gyou) => Array.from({ length: 6 }, (_, i) => [{ ...S(shoNoE({ p: 1, gyou, fade: (i + 1) / 6 })), na: `承 行${gyou}` }, i < 5 ? 0.05 : 0]);
  const betsu = { sen: G.card_d1_semai.marks.betsu };
  return {
    ki: [
      { s: 0, pic: S(hyakuNin({ iro: 0 })) },
      { s: 0, at: '百人に十九人。', seq: Array.from({ length: 20 }, (_, i) => [S(hyakuNin({ iro: i, kazu: i })), i < 19 ? 0.06 : 0]) },
      { s: 1, seq: kyouSeq(0) },
      // 3 文目「大人になっても、十人に一人います」：灯り終わったら「10 人に 1 人」（起の 19 と同じ大きさ）
      { s: 2, seq: Array.from({ length: 11 }, (_, i) => [S(hyakuNin({ iro: i, ue: false, otona: i === 10 })), i < 10 ? 0.06 : 0]) },
    ],
    sho: [
      { s: 0, pic: S(shoNoE({ p: 0 })) },
      { s: 0, plus: 0.05, seq: Array.from({ length: 21 }, (_, i) => [S(shoNoE({ p: i / 20 })), i < 20 ? 0.065 : 0]) },
      { s: 0, at: '説明の板書は写さない。', seq: fadeSeq(1) },
      { s: 1, seq: fadeSeq(2) },
      { s: 2, seq: fadeSeq(3) },
      { s: 3, seq: fadeSeq(4) },
      { s: 4, seq: fadeSeq(5) },
      { s: 4, at: '生徒は答えられます。', ato: 2.5, fuda: KO, pic: B32('承-5 質問の板', shitsumonBan(H0)) },
      { s: 5, ato: 2.5, pic: B32('承-6 見えない 1', miienai(1)) },
      { s: 5, at: '本人だけでは気づけない。', pic: B32('承-6 見えない 2', miienai(2)) },
      { s: 5, at: '小さいようで、', ato: 2.5, pic: B32('承-6 見えない 3', miienai(3)) },
      { s: 6, ato: 2.5, pic: B32('承-7 個に応じた', kyouKo(0, 1)) },
      { s: 6, at: 'それも、', ato: 2.5, seq: Array.from({ length: 36 }, (_, i) => [B32('承-7 クラス全員', kyouKo(i, 2)), i < 35 ? 0.05 : 0]) },
      { s: 6, at: 'そのために提案するのが、', ato: 2.5, seq: Array.from({ length: 12 }, (_, i) => [B32('承-7 題名', daimei(yukkuri((i + 1) / 12))), i < 11 ? 1 / 30 : 0]) },
    ],
    tenA: [
      // 32便：「同じ問題」の板 → 上へ滑って、3 段「読む｜聞く」「文｜図」「一気に｜区切って」が声に合わせて 1 段ずつ
      { s: 0, fuda: KO, pic: B32('転A-1 同じ問題', onajiMondai({})) },
      { s: 0, at: '読むか、', ato: 2.5, fuda: KO, seq: [...Array.from({ length: 12 }, (_, i) => [B32('転A-1 3 段', onajiMondai({ ue: (i + 1) / 12, dan: 1, fade: (i + 1) / 12 })), i < 11 ? 1 / 30 : 0])] },
      { s: 0, at: '文か、', fuda: KO, seq: fadeKoma((f) => B32('転A-1 3 段', onajiMondai({ ue: 1, dan: 2, fade: f }))) },
      { s: 0, at: '一気に読むか、', fuda: KO, seq: fadeKoma((f) => B32('転A-1 3 段', onajiMondai({ ue: 1, dan: 3, fade: f }))) },
      { s: 1, ato: 3.0, fuda: SEN, pic: kiri('d1_hyou') },
      { s: 2, fuda: KO, pic: cardAt(0, [], { sen: G.card_d1_semai.marks.hitokoto }) },
      // 転A-5：カードを左へ滑らせ（400ms）、右に工夫の札 2 枚（声に合わせて。2 枚目は 1.8 秒後）
      { s: 3, fuda: KO, seq: suberu(0, 1, [], betsu) },
      { s: 3, at: '声に出して読む。', fuda: KO, pic: cardAt(1, [KASANE.kufuu[0]], betsu) },
      { s: 3, at: '声に出して読む。', plus: 1.8, fuda: KO, pic: cardAt(1, KASANE.kufuu, betsu) },
      // 転A-6：札を消し、カードを中央へ戻す（400ms）
      { s: 4, fuda: KO, seq: suberu(1, 0, [], {}) },
    ],
    tenB: [
      { s: 0, ato: 2.5, fuda: SEN, pic: B32('転B-1 ヒントの板', claudeBan(H0.kasetsu, { chip: '指導のヒント（仮説）' })) },
      { s: 0, at: 'もちろん、', ato: 3.0, fuda: SEN, seq: kakikaeSeq() },
      { s: 1, ato: 4.0, fuda: SEN, pic: B32('転B-2 例', reiRei(2)) },
      { s: 1, at: 'そして、', ato: 2.5, fuda: SEN, pic: B32('転B-2 安心', anshin()) },
      { s: 2, ato: 2.5, fuda: SEN, seq: Array.from({ length: 8 }, (_, i) => [B32('転B-3 8 人', hachinin(H0, i + 1)), i < 7 ? 0.2 : 0]) },
      { s: 2, at: '生徒への理解は信頼関係につながる。', ato: 2.5, fuda: SEN, pic: B32('転B-3 理解と信頼', rikai()) },
      { s: 3, ato: 2.5, seq: fadeKoma((f) => B32('転B-4 一人一人に', hitoriHitori(1, f))) },
      { s: 3, plus: 0.9, ato: 0.6, seq: fadeKoma((f) => B32('転B-4 一人一人に', hitoriHitori(2, f))) },
      { s: 3, at: 'そのきっかけになるアプリです。', ato: 0.6, seq: fadeKoma((f) => B32('転B-4 一人一人に', hitoriHitori(3, f))) },
    ],
    tenC: [
      { s: 0, fuda: KO, pic: zen('card_d1_semai') },
      { s: 1, ato: 2.5, fuda: KO, pic: kiri('kyou_yarikata', { ue: KASANE.sasae }) },
      { s: 1, at: '別のカードを、', ato: 2.5, fuda: KO, pic: kiri('kyou_renshu', { ue: KASANE.nerai }) },
      { s: 2, ato: 2.5, fuda: KO, pic: kiri('kyou_yarikata', { ue: KASANE.sasae }) },
      { s: 2, at: '明日は、', ato: 2.5, fuda: KO, pic: { k: 'narabe', items: [{ label: KASANE.sodateMae, g: g('sodate_mae_level') }, { label: KASANE.sodateAto, g: g('sodate_ato_level') }] } },
    ],
    fukasa: [
      { s: 0, fuda: SEN, pic: B32('深さ-1 記録の 1 文', claudeBan(H0.kirokuBun, { px: 56, waku: false })) },
      { s: 0, at: 'スイッチを育てる計画を書きます。', ato: 3.0, fuda: SEN, pic: B32('深さ-1 計画の 1 文', claudeBan(H0.keikakuBun, { px: 56, waku: false, chip: '期間の計画' })) },
      { s: 1, ato: 2.5, pic: B32('深さ-3 先生に｜本人に', mieru2(G, H0)) },
    ],
    ketsu: [
      { s: 0, pic: S(kyoushitsu({ x0: KYOU_X_NAKA })) },
      { s: 0, at: '生徒全員の学びに寄り添える。', seq: Array.from({ length: 36 }, (_, i) => [S(kyoushitsu({ x0: KYOU_X_NAKA, cards: i })), i < 35 ? 0.05 : 0]) },
      { s: 1, fuda: KO, pic: zen('card_d1_card') },
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
      // 41便：DOUGA_KOE_DIR/jikoku.json があれば、文の頭（t0）と、文の中のかけらの頭（kt・任意）を、そのファイルの頭からの秒で使う
      //   形：{ "tenA": [ { "t0": 0.0, "kt": [0.0, 1.2, ...] }, ... ], ... }（文の数は台本と同じ。kt の数は字幕のかけらの数と同じ）
      const jp = path.join(KOE_DIR, 'jikoku.json');
      const J = existsSync(jp) ? JSON.parse(readFileSync(jp, 'utf8'))[sec.id] : null;
      if (J) {
        if (J.length !== bun.length) throw new Error(`jikoku.json の ${sec.id} の文の数が台本と違います（${J.length}／${bun.length}）`);
        bun.forEach((b, i) => {
          b.t0 = ATAMA + J[i].t0; b.d = (i + 1 < bun.length ? J[i + 1].t0 : d) - J[i].t0;
          if (J[i].kt) {
            if (J[i].kt.length !== b.jkakera.length) throw new Error(`jikoku.json の ${sec.id} ${i + 1} 文目のかけらの数が違います（${J[i].kt.length}／${b.jkakera.length}：${b.jkakera.join('｜')}）`);
            b.kt = J[i].kt.map((x) => ATAMA + x);
          } else {
            const w = b.jkakera.map(haba); const sw = w.reduce((a, x) => a + x, 0);
            let acc = 0; b.kt = w.map((x) => { const s = b.t0 + (b.d * acc) / sw; acc += x; return s; });
          }
        });
      } else {
        const zen = bun.reduce((a, b) => a + haba(b.jimaku), 0);
        let t = ATAMA;
        for (const b of bun) {
          b.t0 = t; b.d = (d * haba(b.jimaku)) / zen;
          const w = b.jkakera.map(haba); const sw = w.reduce((a, x) => a + x, 0);
          let acc = 0; b.kt = w.map((x) => { const s = b.t0 + (b.d * acc) / sw; acc += x; return s; });
          t += b.d;
        }
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
      // 30便：「早送り」の札は出さない。区間ごとの地の色は使わない
      const notes = { fuda: c.fuda || '', kukan: sec.kukan || '', kakuu: sec.id === 'sho' ? KASANE.kakuu : '', chuui: sec.chuui || [] };
      // 27便：ato＝前の絵から少なくともこの秒は置く（寄りの最短 2.5 秒を守るため、声の名詞より少し遅れることがある）
      let tt = c.ato ? Math.max(tOf(c), maeT + c.ato) : tOf(c);
      maeT = tt;
      if (c.seq) for (const [pic, d] of c.seq) { e.push({ f: fr(tt), pic, notes }); tt += d; }
      else e.push({ f: fr(tt), pic: c.pic, notes });
    }
    e.sort((a, b) => a.f - b.f);
    const kireme = [...new Set([f0, f0 + fLen, ...e.map((x) => x.f), ...mai.flatMap((m) => [m.f, m.owari])])].filter((x) => x >= f0 && x <= f0 + fLen).sort((a, b) => a - b);
    // 30便：3 秒以上止まる絵は、その間に 1.00→1.03 倍へ一定の速さでゆっくり寄る（3 コマごとに倍率を変える）
    e.forEach((x, i) => { x.owari = i < e.length - 1 ? e[i + 1].f : f0 + fLen; });
    // 32便：場面ごとの秒（同じ場面の名前が続くあいだを 1 つに数える）
    const basho = [];
    for (const x of e) {
      const na = x.pic.na || (x.pic.g ? x.pic.g.name : x.pic.k === 'narabe' ? x.pic.items.map((it) => it.g.name).join('｜') : x.pic.k === 'cardfuda' ? 'カードと札' : x.pic.k);
      const last = basho[basho.length - 1];
      if (last && last.na === na) last.owari = x.owari; else basho.push({ na, f: x.f, owari: x.owari });
    }
    const koma = [];
    for (let k = 0; k < kireme.length - 1; k++) {
      const a = kireme[k], b = kireme[k + 1];
      if (b <= a) continue;
      const ev = e.filter((x) => x.f <= a).pop() || e[0];
      const jm = sec.jimakuNashi ? null : mai.find((m) => m.f <= a && a < m.owari);
      const nagai = ev.owari - ev.f >= 3 * FPS && ev.pic.k !== 'zenmen';
      for (let t = a; t < b; t += nagai ? 3 : b - a) {
        const n = Math.min(nagai ? 3 : b - a, b - t);
        const zoom = nagai ? Number((1 + (0.03 * (t - ev.f)) / (ev.owari - ev.f)).toFixed(4)) : undefined;
        koma.push({ f: t, n, spec: { pic: ev.pic, ...ev.notes, jimaku: jm ? jm.lines : [], ...(zoom ? { zoom } : {}) } });
      }
    }
    kukan.push({ e, basho, id: sec.id, na: sec.na, koe: sec.koe, senseiNoKoe: sec.senseiNoKoe || null, f0, fLen, bun: bun.map((b) => ({ ...b, f: fr(b.t0) })), mai, koma });
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
      if (p.k !== 'ita' || !p.g) { push(); continue; }
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
  // 32便：絵の中に出す本物の文（名前・カードの題名・選んだ答え・Claude の文）も、言葉の正本で点検する
  {
    const H0 = G.honmono;
    const hon = [H0.kasetsu, H0.kirokuBun, H0.ichibun, H0.kobetsu, H0.sonomama, H0.shitsumon.toi, ...H0.shitsumon.kotae, ...H0.kotae, ...H0.hachinin.flatMap((k) => [k.namae, k.card])];
    const h2 = hon.flatMap((t) => tenken(String(t)).map((h) => `${h['言葉']}（${t}）`));
    if (h2.length) throw new Error(`絵の中の本物の文に、避ける言葉があります：${h2.join('／')}`);
  }
  writeFileSync(path.join(SAGYOU, 'basho_dump.json'), JSON.stringify(kukan.map((k) => ({ id: k.id, na: k.na, f0: k.f0, fLen: k.fLen, bun: k.bun.map((b) => ({ koe: b.koe, f: b.f, jimaku: b.jimaku, t0: b.t0, d: b.d, kaname: b.kaname, kakera: b.kakera, kt: b.kt })), e: k.e.map((x) => ({ f: x.f, owari: x.owari, id: createHash('md5').update(JSON.stringify(x.pic)).digest('hex').slice(0, 8), na: x.pic.na || (x.pic.g ? x.pic.g.name : ''), fuda: x.notes.fuda, kukan: x.notes.kukan })), basho: k.basho })), null, 1));
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
    // 30便：2-up（各列 840×710 の板）の、切り出しの中のおもな字の 1080p での大きさ
    '2-up の字': Object.fromEntries(['yomu', 'kiku', 'zu', 'kugiri', 'd1_kasetsu_semai', 'card_d1_semai', 'sodate_mae', 'sodate_ato'].map((n) => { const x = G[n]; const sc = Math.min(840 / x.w, 710 / x.h); return [n, x.moji ? `${Math.round(x.moji * DSF * sc)}px（${Math.round(x.w * sc)}×${Math.round(x.h * sc)}）` : `${Math.round(x.w * sc)}×${Math.round(x.h * sc)}`]; })),
    選んで答える質問: G.D_toi,
    一語の書きかえ: `「${G.kakikae.mae}」→「${G.kakikae.ato}」（1 文目：${G.kakikae.ichibun}）`,
    保存した結果の一覧: G.ichiranGyou,
    レベルの行: [G.sodate_mae_levelBun, G.sodate_ato_levelBun],
    撮る幅: '760×428（2.5 倍）。図＋2×2 と先生の画面のデモ1 の全体だけ 960×540',
    字幕・小と枠の重なり: '0 コマ（一コマずつ確かめた）',
    次を選んだ理由の記録: `資料 31 の ${G.kirokuGyou.zen} 行（うち Claude ${G.kirokuGyou.claude} 行）。映したのは ${G.kirokuGyou.utsushita.length} 行`,
    字幕の点検: '避ける言葉 0 件',
    // 32便：場面の一覧（秒・いちばん小さい字）。2.5 秒未満のもの
    場面: kukan.flatMap((k) => k.basho.map((b) => ({ 区間: k.na, 場面: b.na, 秒: Number(((b.owari - b.f) / FPS).toFixed(2)), 字の最小: minPxOf.get(b.na) ?? null }))),
    '2.5 秒未満の場面': kukan.flatMap((k) => k.basho.filter((b) => (b.owari - b.f) / FPS < 2.5).map((b) => `${k.na} ${b.na} ${((b.owari - b.f) / FPS).toFixed(2)} 秒`)),
  };
  writeFileSync(path.join(SAGYOU, 'kekka.json'), JSON.stringify(kekka, null, 1));
  writeFileSync(path.join(SAGYOU, 'jimaku.txt'), kukan.flatMap((k) => k.mai.map((m) => `${(m.f / FPS).toFixed(2)}\t${k.id}\t${m.lines.join(' / ')}`)).join('\n') + '\n');
  console.log(JSON.stringify(kekka, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e); process.exit(1); });
