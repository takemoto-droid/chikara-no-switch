// 3分の動画を作る（24便）。台本は資料の「23 動画の台本（第3版）」。声の文・字幕・画面の順・長さは台本のとおり。
// 使い方：npm run douga:tsukuru
// 要るもの：Playwright と Chromium・ffmpeg・pyopenjtalk の入った Python（DOUGA_PYTHON で指定。既定は python3）・字体 BIZ UDPGothic
// 冒頭の絵：DOUGA_E の SVG（既定は ../chikara-no-switch-shiryo/動画冒頭_100人の点.svg）。無ければ同じ形で描く。
// できるもの：.douga/チカラのスイッチ_3分.mp4 と、区間ごとの真ん中のコマ（.douga/naka/）。.douga は Git に入れない。
// 鍵は使わない（CHIKARA_KEY_NASHI=1）。画面はアプリの本物の写し、声と字幕は台本の文。文は作り直さない。
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT, tenken, seihon } from '../lib/kotoba.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SAGYOU = path.join(ROOT, '.douga');
const GAZOU = path.join(SAGYOU, 'gazou');
const KOMA = path.join(SAGYOU, 'koma');
const KOE = path.join(SAGYOU, 'koe');
const NAKA = path.join(SAGYOU, 'naka');
const DEKIAGARI = path.join(SAGYOU, 'チカラのスイッチ_3分.mp4');
const PY = process.env.DOUGA_PYTHON || 'python3';
const E_SVG = process.env.DOUGA_E || path.join(ROOT, '..', 'chikara-no-switch-shiryo', '動画冒頭_100人の点.svg');

const FPS = 30;
const ATAMA = 0.5; // 区間の頭の間（秒）
const AIDA = 0.28; // 文と文の間（秒）
const SAIGO = 4; // 最後の一枚（秒）
const DSF = 2; // 画面写しの倍率（1280×720 の画面を 2 倍で写し、組むときに縮める）
const SAMPLE = 48000;

// ---- 台本（23 第3版 §1）。koe：声の文（台本のまま）。字幕は koe から作る
const DAIHON = [
  { id: 'ki', na: '起', bg: '#0E0F12', bun: [
    '文章を読んで、理解して、使うこと。',
    'そこに難しさを抱える十五歳は、百人に十九人。',
    '大人でも、決して少なくありません。',
  ] },
  { id: 'shou', na: '承', bun: [
    '私は中学校の教員です。',
    '解けているのに、ノートは白紙の子がいます。',
    '本人は、何に困っているかを、言葉にできません。',
    '困ったら言ってね、は届きません。',
    'でも、こちらから具体的にたずねると、答えてくれます。',
    '検査や専門家の代わりではなく、その手前を、学校の時間の中で、クラス全員に。',
    'それが、チカラのスイッチです。',
  ] },
  { id: 'ten1', na: '転-1', bun: [
    'ホームルームの時間に、同じ難しさの問題を、出し方だけ変えて解きます。',
    '読むと聞く。文と図。一気にと、区切って。',
    '問題は同じで、変えるのは出し方だけです。',
    '困りごとの言葉は、こちらが用意します。',
    '本人は選ぶだけ。自由に文を打つ入口はありません。',
  ] },
  { id: 'ten2', na: '転-2', bun: [
    '比べる相手は、ほかの子ではなく、同じ問題を別の出し方で解いた自分です。',
    '力が出た出し方が、カードになって本人に届きます。',
    '型を決めるのではなく、この日にあった事実だけ。',
    '別の日は違うかも、と書いてあります。',
    '合計も順位も出しません。',
  ] },
  { id: 'ten3', na: '転-3', bun: [
    '先生の画面では、比べた結果と、本人が選んだ答えと、先生の気づきを並べて、クロードが仮説を下書きします。',
    '文は、かも、で止まり、確かめた回数が添えられます。',
    '決めるのは先生です。',
    '下書きは先生が直して使い、保護者には、何をして何をしないかを、先に案内します。',
    '見つけたら、育てます。',
    '得意な出し方を支えにして、もう一方を、支えを少しずつ減らしながら、朝の十分で練習します。',
  ] },
  { id: 'fukasa', na: 'Claude と深さ', bun: [
    'クロードには、測る問題を作らせません。',
    '問題を変えると、何の差なのか分からなくなるからです。',
    'クロードは、次に出す出し方を、理由つきで選びます。',
    'そして、結果と、本人が選んだ答えを読み合わせて、仮説と懇談の下書きを書きます。',
    '決まった文は、事実を並べるだけ。',
    'クロードは、そのままにしている、という答えを、こちらから声をかけて確かめる、という次の一手につなげます。',
    '出力は、四十の避ける言葉で機械的に点検し、引っかかれば書き直させます。',
    'いちばん難しかったのは、一回で決めつけない線を引くこと。',
    '十二通りを比べ、最初の線のままにしました。',
  ] },
  { id: 'ketsu', na: '結', bun: [
    '検査を受けられる一部の子ではなく、ホームルームと朝の時間だけで、クラス全員が使えます。',
    '学校ごとの設定で、次の年にも引き継げます。',
    '学力への効果は、まだ確かめていません。',
    '言えるのは、ゲームの中で、支えが少なくてもできた、という事実までです。',
  ] },
];

// 合成の声に渡すときだけ読みを直す（文は変えない）。既定の辞書だと「言って」を「ゲンッテ」、「区切って」を「クギリッテ」と読むため
const YOMI_NAOSHI = [['言ってね', 'いってね'], ['区切って', 'くぎって']];
// 字幕：「クロード」は「Claude」、かな数字（漢数字）は算用数字（台本 §1）
const JIMAKU_KAE = [['クロード', 'Claude'], ['十五歳', '15 歳'], ['百人に十九人', '100 人に 19 人'], ['朝の十分', '朝の 10 分'], ['四十の', '40 の'], ['十二通り', '12 通り'], ['一回で', '1 回で']];
const yomiOf = (s) => YOMI_NAOSHI.reduce((a, [x, y]) => a.replaceAll(x, y), s);
const jimakuOf = (s) => JIMAKU_KAE.reduce((a, [x, y]) => a.replaceAll(x, y), s).replace(/Claude(?=[^\s、。])/g, 'Claude ').replace(/([^\s\x20-\x7e、。「])(?=[0-9])/g, '$1 ');

// 画面に重ねる文（見出し・小さい注・左右の札・最後の一枚）。字幕と同じく言葉の正本で点検する
const KASANE = {
  kakuu: 'この動画の子は、架空の子です',
  hayaokuri: '早送り',
  kouka: '学力への効果は確かめていません',
  kakuuData: '架空の子のデータで確かめた',
  shou: ['解けているのに、ノートは白紙。', '「困ったら言ってね」では、声は上がらない。', 'でも、こちらからたずねれば、答えてくれる。'],
  yomu: '📖 読む', kiku: '👂 聞く', kikuSoe: '上と同じ文章を、\n声で聞く',
  ikki: '📄 まとめて読む', kugiri: '✂️ 一文ずつ読む',
  kimatta: 'Claude を使わないときの決まった文', claude: 'Claude（AI）が書いた下書き（保存したもの）',
  saigo: ['チカラのスイッチ', '言葉にできなくても、力のスイッチを見つけて育てる', 'github.com/takemoto-droid/chikara-no-switch', 'Built with Claude Code'],
  // 声 “Mei” は CC BY 3.0。docs/権利と出典.md の決まり（動画にも同じ表示を入れる）で、最後の一枚の下に小さく出す
  koeHyouji: 'ナレーションの音声：Open JTalk で作成。声 “Mei” © 2009-2013 Nagoya Institute of Technology（CC BY 3.0）',
  sakeruDai: '言葉の正本（data/言葉の正本.json）の「避ける言葉」', senDai: '線の比べ（docs/線の比べ_6便.md）',
};

// ---- 字幕の行わけ（1行最大 26 字・2行まで。長い文は区切りで2枚に分ける）
const MAX = 26;
const haba = (s) => [...s].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0);
const KUGIRI = /[、。？！]/;
function kugiriNoIchi(s) {
  const out = [];
  [...s].forEach((c, i, arr) => { if (KUGIRI.test(c) && i < arr.length - 1) out.push(arr.slice(0, i + 1).join('').length); });
  return out;
}
function futagyou(s) {
  if (haba(s) <= MAX) return [s];
  let best = null;
  for (const p of kugiriNoIchi(s)) {
    const a = s.slice(0, p), b = s.slice(p);
    if (haba(a) <= MAX && haba(b) <= MAX) {
      const sa = Math.abs(haba(a) - haba(b));
      if (!best || sa < best.sa) best = { sa, gyou: [a, b] };
    }
  }
  return best ? best.gyou : null;
}
export function jimakuNoMai(s) {
  const f = futagyou(s);
  if (f) return [f];
  // 区切りで2枚に分ける（どちらも2行に収まる所のうち、釣り合いのよい所）
  let best = null;
  for (const p of kugiriNoIchi(s)) {
    const a = s.slice(0, p), b = s.slice(p);
    const fa = futagyou(a), fb = futagyou(b);
    if (fa && fb) {
      const sa = Math.abs(haba(a) - haba(b));
      if (!best || sa < best.sa) best = { sa, mai: [fa, fb] };
    }
  }
  if (best) return best.mai;
  throw new Error(`字幕が2行に収まりません：${s}`);
}

// ---- 1. 声
function koeWoTsukuru() {
  mkdirSync(KOE, { recursive: true });
  const bun = DAIHON.flatMap((sec) => sec.bun.map((b, i) => ({ key: `${sec.id}_${i + 1}`, yomi: yomiOf(b) })));
  const src = path.join(KOE, 'bun.json');
  writeFileSync(src, JSON.stringify(bun, null, 1));
  const r = spawnSync(PY, [path.join(ROOT, 'scripts', 'douga_koe.py'), src, KOE], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`声を作れませんでした（${PY}）。pyopenjtalk を入れてください：python3 -m venv .onsei-env && .onsei-env/bin/pip install pyopenjtalk → DOUGA_PYTHON=.onsei-env/bin/python`);
  return JSON.parse(readFileSync(path.join(KOE, 'nagasa.json'), 'utf8'));
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
      return new Int16Array(b.buffer.slice(b.byteOffset + i + 8, b.byteOffset + i + 8 + size));
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
  const atarashii = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
    return ctx.newPage();
  };

  // ページの中の道具：要素の四角（ページの座標）・文字の四角・見えてはいけない言葉
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
  // 写して、印（枠・下線・タップ）の位置を画像の座標で残す。marks：{ 名前: [ページの四角] }
  const shashin = async (page, name, clip, marks = {}) => {
    await yoi(page);
    const kin = await page.evaluate(([c, w]) => window.__kinshi(c, w), [clip, KINSHI]);
    if (kin.length) throw new Error(`${name} に映してはいけない表示があります：${kin.join('・')}`);
    const file = path.join(GAZOU, `${name}.png`);
    await page.screenshot({ path: file, clip, fullPage: true });
    const m = {};
    for (const [k, rs] of Object.entries(marks)) m[k] = rs.map((r) => ({ x: (r.x - clip.x) * DSF, y: (r.y - clip.y) * DSF, w: r.width * DSF, h: r.height * DSF }));
    G[name] = { file, w: Math.round(clip.width * DSF), h: Math.round(clip.height * DSF), marks: m };
  };
  const zen = async (page, name, marks = {}) => {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await shashin(page, name, { x: s.x, y: s.y, width: 1280, height: 720 }, marks);
  };
  // pad：まわりの余白（数か { ue, shita, yoko }）。上下は、となりの札や行がはみ出して映らないよう小さくできる
  const kiru = async (page, name, rect, marks = {}, pad = 14) => {
    await page.waitForTimeout(300);
    const pd = typeof pad === 'number' ? { ue: pad, shita: pad, yoko: pad } : { ue: 14, shita: 14, yoko: 14, ...pad };
    const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    const x = Math.max(0, rect.x - pd.yoko), y = Math.max(0, rect.y - pd.ue);
    const clip = { x, y, width: Math.min(doc.w - x, rect.width + pd.yoko * 2), height: Math.min(doc.h - y, rect.y - y + rect.height + pd.shita) };
    await shashin(page, name, clip, marks);
  };
  const shikaku = async (page, sel) => { await yoi(page); return page.locator(sel).first().evaluate((el) => window.__shikaku(el)); };
  const moji = async (page, sel, sub) => {
    await yoi(page);
    const rs = await page.locator(sel).first().evaluate((el, s) => window.__moji(el, s), sub);
    if (!rs.length) throw new Error(`画面に「${sub}」が見つかりません（${sel}）`);
    return rs;
  };
  const vis = async (page, sel) => { const l = page.locator(sel).first(); return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled().catch(() => true)); };

  try {
    // ---- その場で動かす子（はじめの画面 → 案内 → ゲーム）
    const page = await atarashii();
    await page.goto(`${BASE}#/`);
    await page.waitForSelector('a[href="#/annai/ko"] .box');
    await zen(page, 'home', { sonoba: [await shikaku(page, 'a[href="#/annai/ko"] .box')] });
    await page.click('a[href="#/annai/ko"] >> nth=0');
    await page.waitForSelector('.annai-ichibun');
    await zen(page, 'annai_1');
    while (await vis(page, '#annai-tsugi')) await page.click('#annai-tsugi');
    await page.click('a[href="#/hajimeru"]');

    const stepNoNakami = () => page.evaluate(async () => {
      const { stepOf } = await import('/js/kurabe.js');
      const { getRecord } = await import('/js/kiroku.js');
      const el = document.querySelector('#riyuu[data-step]');
      const id = decodeURIComponent(location.hash.replace('#/game/', ''));
      const rec = await getRecord(id);
      const st = el && rec ? stepOf(rec, el.dataset.step) : null;
      return st ? { id: st.id, kind: st.kind, mode: st.mode, mondai: st.mondai, renshu: Boolean(st.renshu), ichibun: el.textContent.trim() } : null;
    });
    const gameNoBasho = async () => union([await shikaku(page, '#riyuu'), await shikaku(page, '#mondai')]);
    const gameKiru = async (name) => kiru(page, name, await gameNoBasho(), {}, { ue: 6 });
    const A = { yomu: {}, kiku: {} };
    let ff = 0;
    let dTsugi = false;
    for (let ko = 1; ko <= 4; ko++) {
      if (ko > 1) { await page.goto(`${BASE}#/hajimeru`); }
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
            if (ko === 1) await zen(page, `ff_${String(++ff).padStart(2, '0')}`);
            if (st.kind === 'A' && !st.renshu) {
              const futsuu = !st.ichibun.includes('新しい');
              const kago = A[st.mode];
              if (!kago[st.mondai] || (futsuu && !kago[st.mondai].futsuu)) {
                const name = `${st.mode}_${st.mondai}`;
                await gameKiru(name);
                kago[st.mondai] = { name, futsuu };
              }
              if (st.mode === 'kiku' && futsuu && !G.kiku_zen) await zen(page, 'kiku_zen', { ichibun: [await shikaku(page, '#riyuu')] });
            }
            if ((st.kind === 'B' || st.kind === 'C') && !G[st.mode] && !st.ichibun.includes('新しい')) await gameKiru(st.mode);
            if (st.kind === 'D' && !dTsugi) {
              // 選んで答える質問に、1つタップで答える（3つ目の答え）
              await zen(page, 'D_mae', { choice: [await shikaku(page, '.choice >> nth=2')] });
              await page.locator('.choice').nth(2).click();
              await page.waitForFunction((s) => document.querySelector('#riyuu[data-step]')?.dataset.step !== s, step);
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
      const pair = Object.keys(A.yomu).filter((m) => A.kiku[m]);
      const onaji = pair.find((m) => A.yomu[m].futsuu && A.kiku[m].futsuu) || (ko === 4 ? pair[0] : null);
      if (onaji && G.bun && G.zu && G.ikki && G.kugiri && G.kiku_zen) { G.yomu = G[A.yomu[onaji].name]; G.kiku = G[A.kiku[onaji].name]; G.onajiMondai = onaji; break; }
    }
    if (!G.yomu) throw new Error('読む版と聞く版で同じ文章の画面を写せませんでした');
    G.ff = Array.from({ length: ff }, (_, i) => `ff_${String(i + 1).padStart(2, '0')}`);

    // 先生の画面の「ゲームで Claude が次を選んだ理由の記録」（その場で動かした1人目の子）
    await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent('その場1')}`);
    await page.waitForSelector('details summary');
    const sum = page.locator('summary', { hasText: '次を選んだ理由の記録' });
    await sum.click();
    await page.waitForTimeout(300);
    const riyuu = await sum.evaluate((s) => { const d = s.closest('details'); const li = d.querySelectorAll('li'); return [window.__shikaku(s), window.__shikaku(li[Math.min(5, li.length - 1)])]; });
    await kiru(page, 'riyuu_kiroku', union(riyuu), {}, { shita: 4 });
    await page.context().close();

    // ---- 保存した結果（架空の子・デモ1）。その場の子のいない端末で開く（保存した Claude の文が出る）
    const p2 = await atarashii();
    await p2.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('#kasetsu .kasetsu');
    await p2.waitForSelector('#kasetsu .label.ai');
    await zen(p2, 'sensei_d1');
    await yoi(p2);
    const hyou = await p2.evaluate(() => {
      const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === '読む／聞く');
      let t = h.nextElementSibling;
      while (t && t.tagName !== 'TABLE' && !t.querySelector('table')) t = t.nextElementSibling;
      return [window.__shikaku(h), window.__shikaku(t)];
    });
    await kiru(p2, 'd1_hyou', union(hyou));
    const kp = await p2.evaluate(() => [...document.querySelectorAll('#kasetsu > *')].map((el) => ({ tag: el.tagName, r: window.__shikaku(el), t: el.textContent.slice(0, 20) })));
    // #kasetsu の中：0 札・1 仮説・2 次に試すなら・3 確かめた回数・4 見出し・5 理由の一覧・6 参考程度・7 保存の印
    const ul = kp.findIndex((x) => x.tag === 'UL');
    const shirushiEl = kp.findIndex((x) => x.t.startsWith('Claude（AI）が 2026'));
    if (ul < 0 || shirushiEl < 0) throw new Error('先生の画面の仮説の欄の形が、思っていたものと違います');
    await kiru(p2, 'd1_shirushi', union([kp[shirushiEl - 1].r, kp[shirushiEl].r]), { waku: await moji(p2, `#kasetsu > :nth-child(${shirushiEl + 1})`, 'Claude（AI）が 2026-11-04 に書いた下書き（保存したもの）') });
    await kiru(p2, 'd1_kasetsu_ue', union(kp.slice(0, 4).map((x) => x.r)), { kasetsu: [kp[1].r], kakunin: [kp[3].r] });
    const migiSen = [
      ...(await moji(p2, '#kasetsu > :nth-child(3)', 'こちらから個別に声をかけて確かめる')),
      ...(await moji(p2, '#kasetsu li:has-text("授業で分からない")', '授業で分からないとき')),
      ...(await moji(p2, '#kasetsu li:has-text("授業で分からない")', 'そのままにしている')),
    ];
    await kiru(p2, 'hikaku_migi', union(kp.slice(1, ul + 1).map((x) => x.r)), { sen: migiSen }, { ue: 6 });

    await p2.goto(`${BASE}#/card/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('.switch-card');
    await zen(p2, 'card_d1');
    await kiru(p2, 'card_d1_card', await shikaku(p2, '.switch-card'), { waku: await moji(p2, '.switch-card', '別の日は 違うかも。') });

    // ⑤ 伝え方：懇談の下書きの1語を、先生が書きかえる（「試して」→「続けて」）
    await p2.goto(`${BASE}#/tsutae/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('textarea');
    await p2.waitForTimeout(500);
    await zen(p2, 'tsutae_d1');
    const konRect = union([await shikaku(p2, 'h2:has-text("懇談")'), await shikaku(p2, 'textarea')]);
    await kiru(p2, 'type_0', konRect);
    const ta = p2.locator('textarea').first();
    const at = await ta.evaluate((t) => t.value.indexOf('試して'));
    if (at < 0) throw new Error('懇談の下書きに「試して」がありません');
    await ta.evaluate((t, a) => { t.focus(); t.setSelectionRange(a, a + 2); }, at);
    await kiru(p2, 'type_1', konRect);
    await p2.keyboard.type('続');
    await kiru(p2, 'type_2', konRect);
    await p2.keyboard.type('け');
    await kiru(p2, 'type_3', konRect);

    // ⑥ 育てる（朝の練習）
    await p2.goto(`${BASE}#/sodateru/${encodeURIComponent('デモ1')}`);
    await p2.waitForSelector('text=今日の練習');
    await zen(p2, 'sodateru_d1');
    await kiru(p2, 'sodateru_kyou', await p2.locator('text=今日の練習').first().evaluate((el) => window.__shikaku(el.closest('.box') || el.parentElement)));

    // 先生の画面：学校の設定と期間の計画（保存した Claude の計画）
    await p2.goto(`${BASE}#/sensei`);
    await p2.waitForSelector('#keikaku li');
    if (await p2.locator('#keikaku .label.yobi').count()) throw new Error('期間の計画が予備の動きになっています');
    await zen(p2, 'sensei_top');
    const kei = await p2.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('学校の設定'));
      const li = document.querySelectorAll('#keikaku li');
      return [window.__shikaku(h), window.__shikaku(li[1])];
    });
    await kiru(p2, 'settei_keikaku', union(kei), {}, { shita: 6 });
    await p2.context().close();

    // ---- Claude を使わないときの決まった文（同じデモ1で「もう一度書いてもらう」。鍵が無いので決まった文が出る）
    const p3 = await atarashii();
    await p3.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ1')}`);
    await p3.waitForSelector('#kasetsu .label.ai');
    await p3.click('#kasetsu #again');
    await p3.waitForSelector('#kasetsu .label.yobi');
    await p3.waitForTimeout(300);
    await yoi(p3);
    const kp3 = await p3.evaluate(() => [...document.querySelectorAll('#kasetsu > *')].map((el) => ({ tag: el.tagName, r: window.__shikaku(el) })));
    const ul3 = kp3.findIndex((x) => x.tag === 'UL');
    await kiru(p3, 'hikaku_hidari', union(kp3.slice(1, ul3 + 1).map((x) => x.r)), {}, { ue: 6 });
    await p3.context().close();
  } finally {
    await browser.close();
    srv.kill();
  }
  return G;
}

// ---- 3. 一コマずつ組む（Playwright で 1920×1080 の HTML を写す）
const P = { x: 196, y: 60, w: 1528, h: 860 };
const KUMI_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:"BIZ UDPGothic","Noto Sans JP",sans-serif;}
#f{position:absolute;inset:0;background:#1E2228;}
#p{position:absolute;left:${P.x}px;top:${P.y}px;width:${P.w}px;height:${P.h}px;overflow:hidden;border-radius:6px;}
#midashi{position:absolute;left:${P.x}px;top:11px;height:38px;line-height:38px;padding:0 18px;border-radius:19px;background:#2E6F93;color:#fff;font-size:23px;font-weight:700;}
#jimaku{position:absolute;left:0;right:0;top:934px;height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-size:42px;line-height:1.3;font-weight:700;letter-spacing:.02em;text-shadow:0 2px 6px rgba(0,0,0,.5);}
#hayaokuri{position:absolute;right:${1920 - P.x - P.w}px;top:928px;font-size:20px;color:#1E2228;background:#E9C46A;padding:2px 12px;border-radius:12px;font-weight:700;}
#ue{position:absolute;left:50%;transform:translateX(-50%);top:${P.y + P.h - 58}px;font-size:22px;color:#fff;background:rgba(20,22,26,.82);padding:6px 18px;border-radius:16px;white-space:nowrap;}
#shita{position:absolute;left:0;right:0;top:1048px;text-align:center;font-size:19px;color:#B8BDC4;}
#kakuu{position:absolute;right:${1920 - P.x - P.w + 20}px;top:${P.y + P.h - 46}px;font-size:20px;color:#6B6760;}
#zenmen{position:absolute;inset:0;display:none;}
.hide{display:none!important;}
.waku-img{position:absolute;}
.waku-img img{width:100%;height:100%;display:block;}
.mk-waku{position:absolute;border:5px solid #F2A33A;border-radius:10px;box-shadow:0 0 0 3px rgba(242,163,58,.25);}
.mk-sen{position:absolute;height:7px;background:#F2A33A;border-radius:4px;}
.mk-tap{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;border:6px solid #F2A33A;background:rgba(242,163,58,.25);}
.label-w{color:#fff;font-size:30px;font-weight:700;}
</style></head><body><div id="f"><div id="p"></div><div id="midashi"></div><div id="jimaku"></div><div id="hayaokuri"></div><div id="ue"></div><div id="shita"></div><div id="kakuu"></div><div id="zenmen"></div></div>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nose = (el, s) => { el.textContent = s || ''; el.classList.toggle('hide', !s); };
function gazou(parent, g, box, o = {}) {
  const sc = Math.min(box.w / g.w, box.h / g.h, o.max || 99);
  const w = g.w * sc, h = g.h * sc;
  const d = document.createElement('div');
  d.className = 'waku-img';
  Object.assign(d.style, { left: box.x + (box.w - w) / 2 + 'px', top: box.y + (o.ue ? 0 : (box.h - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
  if (o.kage) Object.assign(d.style, { boxShadow: '0 12px 40px rgba(0,0,0,.55)', borderRadius: '10px', overflow: 'visible' });
  const img = document.createElement('img');
  img.src = g.src;
  if (o.kage) img.style.borderRadius = '10px';
  d.appendChild(img);
  for (const r of (o.waku || [])) {
    const m = document.createElement('div'); m.className = 'mk-waku';
    Object.assign(m.style, { left: r.x * sc - 10 + 'px', top: r.y * sc - 8 + 'px', width: r.w * sc + 20 - 10 + 'px', height: r.h * sc + 16 - 10 + 'px' });
    d.appendChild(m);
  }
  for (const r of (o.sen || [])) {
    const m = document.createElement('div'); m.className = 'mk-sen';
    Object.assign(m.style, { left: r.x * sc + 'px', top: (r.y + r.h) * sc - 2 + 'px', width: r.w * sc + 'px' });
    d.appendChild(m);
  }
  for (const r of (o.tap || [])) {
    const m = document.createElement('div'); m.className = 'mk-tap';
    Object.assign(m.style, { left: (r.x + r.w / 2) * sc + 'px', top: (r.y + r.h / 2) * sc + 'px' });
    d.appendChild(m);
  }
  parent.appendChild(d);
  return img.decode();
}
function fit(el, max = 1.6) {
  const w = el.scrollWidth, h = el.scrollHeight;
  const sc = Math.min(${P.w} / w, ${P.h} / h, max);
  Object.assign(el.style, { position: 'absolute', left: (${P.w} - w * sc) / 2 + 'px', top: (${P.h} - h * sc) / 2 + 'px', transform: 'scale(' + sc + ')', transformOrigin: '0 0' });
}
window.kaku = async (s) => {
  $('f').style.background = s.bg || '#1E2228';
  nose($('midashi'), s.midashi);
  $('jimaku').innerHTML = (s.jimaku || []).map((l) => '<div>' + esc(l) + '</div>').join('');
  nose($('hayaokuri'), s.hayaokuri);
  nose($('ue'), s.ue);
  nose($('shita'), s.shita);
  nose($('kakuu'), s.kakuu);
  const p = $('p');
  p.innerHTML = '';
  p.style.background = 'transparent';
  $('zenmen').style.display = 'none';
  const e = s.pic;
  const all = { x: 0, y: 0, w: ${P.w}, h: ${P.h} };
  const waits = [];
  if (e.k === 'zen') waits.push(gazou(p, e.g, all, e.o));
  if (e.k === 'kiri') {
    if (e.haikei) {
      waits.push(gazou(p, e.haikei, all));
      const dim = document.createElement('div');
      Object.assign(dim.style, { position: 'absolute', inset: 0, background: 'rgba(14,15,18,.64)' });
      p.appendChild(dim);
    } else p.style.background = '#3A3F47';
    waits.push(gazou(p, e.g, { x: 48, y: 36, w: ${P.w} - 96, h: ${P.h} - 72 }, { ...e.o, max: e.max || 1.3, kage: true }));
  }
  if (e.k === 'narabe') {
    p.style.background = '#2A2F36';
    const n = e.items.length, gap = 28;
    e.items.forEach((it, i) => {
      if (e.muki === 'tate') {
        const ch = (${P.h} - gap * (n + 1)) / n, y = gap + i * (ch + gap);
        const lb = document.createElement('div'); lb.className = 'label-w';
        Object.assign(lb.style, { position: 'absolute', left: '28px', top: y + 'px', width: '230px', height: ch + 'px', display: 'flex', flexDirection: 'column', justifyContent: 'center' });
        lb.innerHTML = '<div>' + esc(it.label) + '</div>' + (it.soe ? '<div style="font-size:21px;font-weight:400;color:#C9CDD2;margin-top:10px;line-height:1.4;white-space:pre-line">' + esc(it.soe) + '</div>' : '');
        p.appendChild(lb);
        waits.push(gazou(p, it.g, { x: 270, y, w: ${P.w} - 270 - 28, h: ch }, { ...it.o, kage: true }));
      } else {
        const cw = (${P.w} - gap * (n + 1)) / n, x = gap + i * (cw + gap);
        const lb = document.createElement('div'); lb.className = 'label-w';
        Object.assign(lb.style, { position: 'absolute', left: x + 'px', top: '22px', width: cw + 'px', textAlign: 'center', fontSize: '28px' });
        lb.textContent = it.label;
        p.appendChild(lb);
        waits.push(gazou(p, it.g, { x, y: 76, w: cw, h: ${P.h} - 76 - 22 }, { ...it.o, kage: true, ue: true }));
      }
    });
  }
  if (e.k === 'html') {
    p.style.background = e.pbg || '#F5F3EE';
    const d = document.createElement('div');
    d.innerHTML = e.html;
    p.appendChild(d);
    d.style.display = 'inline-block';
    fit(d, e.max || 1.6);
  }
  if (e.k === 'e') {
    p.style.background = '#0E0F12';
    p.innerHTML = e.svg;
    const svg = p.querySelector('svg');
    svg.setAttribute('width', ${P.w}); svg.setAttribute('height', ${P.h});
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const iro = [...svg.querySelectorAll('circle')].filter((c) => c.getAttribute('fill').toUpperCase() === '#F2A33A');
    iro.forEach((c, i) => { if (i >= e.iro) c.setAttribute('fill', '#3A3F47'); });
    const t = svg.querySelectorAll('text');
    e.mieru.forEach((m, i) => { if (t[i]) t[i].style.visibility = m ? 'visible' : 'hidden'; });
  }
  if (e.k === 'zenmen') {
    const z = $('zenmen');
    z.style.display = 'block';
    z.innerHTML = e.html;
  }
  await Promise.all(waits);
  await document.fonts.ready;
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
  try {
    for (const s of specs) {
      const key = createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 16);
      if (files.has(key)) continue;
      const file = path.join(KOMA, `${key}.png`);
      await page.evaluate((x) => window.kaku(x), s);
      await page.screenshot({ path: file });
      files.set(key, file);
    }
  } finally {
    await browser.close();
  }
  return (s) => files.get(createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 16));
}

// ---- 区間ごとの絵の並び（台本 §1 の「画面」）
function eNoNarabi(G, eSvg) {
  const g = (name) => {
    const x = G[name];
    if (!x) throw new Error(`画面の写しがありません：${name}`);
    return { src: pathToFileURL(x.file).href, w: x.w, h: x.h };
  };
  const mk = (name, kinds) => Object.fromEntries(Object.entries(kinds).map(([k, m]) => [k, G[name].marks[m]]));
  const zen = (name, o = {}) => ({ k: 'zen', g: g(name), o });
  const kiri = (name, haikei, o = {}, max) => ({ k: 'kiri', g: g(name), haikei: haikei ? g(haikei) : null, o, max });
  const svgE = (iro, mieru) => ({ k: 'e', svg: eSvg, iro, mieru: [...mieru, 1, 1] });
  const shou = (lines) => ({
    k: 'html', pbg: '#F3EFE6', max: 1,
    html: `<div style="width:${P.w}px;height:${P.h}px;display:flex;flex-direction:column;justify-content:center;padding:0 120px;box-sizing:border-box;gap:46px">${lines.map((l, i) => `<div style="font-size:64px;font-weight:700;line-height:1.35;color:${i === lines.length - 1 ? '#22252A' : '#A39D92'}">${l}</div>`).join('')}</div>`,
  });
  const sakeru = seihon()['避ける言葉'];
  const sakeruHtml = {
    k: 'html', pbg: '#F5F3EE', max: 1,
    html: `<div style="width:${P.w}px;padding:26px 40px;box-sizing:border-box">
      <div style="font-size:30px;font-weight:700;color:#22252A;margin-bottom:12px">${KASANE.sakeruDai}　${sakeru.length}</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px 12px">${sakeru.map((w) => `<div style="background:#fff;border:1px solid #D9D3C7;border-radius:8px;padding:6px 12px;font-size:21px;line-height:1.35"><b>${w['言葉']}</b><br><span style="font-size:16px;color:#6B6760">→ ${w['寄せる言葉']}</span></div>`).join('')}</div></div>`,
  };
  const md = readFileSync(path.join(ROOT, 'docs', '線の比べ_6便.md'), 'utf8').split('\n');
  const hyouGyou = [];
  for (const l of md.slice(md.findIndex((x) => x.startsWith('| 線 |')))) { if (!l.startsWith('|')) break; hyouGyou.push(l.split('|').slice(1, -1).map((c) => c.trim())); }
  const [midashiGyou, , ...gyou] = hyouGyou;
  const senHyou = (shirushi) => ({
    k: 'html', pbg: '#F5F3EE', max: 1,
    html: `<div style="width:${P.w}px;padding:24px 34px;box-sizing:border-box;font-size:17px;line-height:1.4;color:#22252A">
      <div style="font-size:28px;font-weight:700;margin-bottom:12px">${KASANE.senDai}</div>
      <table style="border-collapse:collapse;width:100%">
      <tr>${midashiGyou.map((c) => `<th style="background:#E5E0D5;border:1px solid #CFC8BA;padding:6px 8px;text-align:left">${c}</th>`).join('')}</tr>
      ${gyou.map((r, i) => `<tr style="${i === 0 && shirushi ? 'outline:5px solid #F2A33A;outline-offset:-2px;background:#FFF4E2' : 'background:#fff'}">${r.map((c) => `<td style="border:1px solid #D9D3C7;padding:5px 8px;vertical-align:top">${c}</td>`).join('')}</tr>`).join('')}
      </table></div>`,
  });
  const saigo = {
    k: 'zenmen',
    html: `<div style="position:relative;width:1920px;height:1080px;background:#1E2228;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center">
      <div style="font-size:96px;font-weight:700">${KASANE.saigo[0]}</div>
      <div style="font-size:44px">${KASANE.saigo[1]}</div>
      <div style="font-size:30px;color:#C9CDD2;margin-top:40px">${KASANE.saigo[2]}　${KASANE.saigo[3]}</div>
      <div style="position:absolute;left:0;right:0;bottom:44px;font-size:20px;color:#8E949C">${KASANE.koeHyouji}</div></div>`,
  };
  const ffKoma = G.ff.map((n) => [zen(n), 3 / FPS]);
  const yomuKiku = { k: 'narabe', muki: 'tate', items: [{ label: KASANE.yomu, g: g('yomu') }, { label: KASANE.kiku, soe: KASANE.kikuSoe, g: g('kiku') }] };
  const ikkiKugiri = { k: 'narabe', muki: 'tate', items: [{ label: KASANE.ikki, g: g('ikki') }, { label: KASANE.kugiri, g: g('kugiri') }] };
  const hikaku = (sen) => ({ k: 'narabe', muki: 'yoko', items: [{ label: KASANE.kimatta, g: g('hikaku_hidari') }, { label: KASANE.claude, g: g('hikaku_migi'), o: sen ? mk('hikaku_migi', { sen: 'sen' }) : {} }] });
  // cue：s 文の番号（0 から）・f その文の中の位置（0〜1）・pic 絵（seq は [絵, 秒] の並び）
  return {
    ki: [
      { s: 0, f: 0, pic: svgE(0, [1, 0, 0]) },
      { s: 1, f: 0, seq: Array.from({ length: 20 }, (_, i) => [svgE(i, [1, 1, 0]), 2 / FPS]) },
      { s: 2, f: 0, pic: svgE(19, [1, 1, 1]) },
    ],
    shou: [
      { s: 0, f: 0, pic: shou([]) },
      { s: 1, f: 0, pic: shou([KASANE.shou[0]]) },
      { s: 3, f: 0, pic: shou([KASANE.shou[1]]) },
      { s: 4, f: 0, pic: shou([KASANE.shou[2]]) },
      { s: 5, f: 0, pic: shou(KASANE.shou) },
      { s: 6, f: 0, pic: zen('home') },
    ],
    ten1: [
      { s: 0, f: 0, midashi: '① 見つける', pic: zen('home') },
      { s: 0, f: 0.28, pic: zen('home', mk('home', { tap: 'sonoba' })) },
      { s: 0, f: 0.4, pic: zen('annai_1') },
      { s: 0, f: 0.52, hayaokuri: true, seq: ffKoma },
      { s: 1, f: 0, pic: yomuKiku },
      { s: 1, f: 0.4, pic: kiri('bun', null, {}, 1) },
      { s: 1, f: 0.58, pic: kiri('zu', null, {}, 1) },
      { s: 1, f: 0.76, pic: ikkiKugiri },
      { s: 2, f: 0, pic: yomuKiku },
      { s: 3, f: 0, pic: zen('D_mae') },
      { s: 4, f: 0.12, seq: [[zen('D_mae', mk('D_mae', { tap: 'choice' })), 0.6], [zen('D_ato'), 0]] },
    ],
    ten2: [
      { s: 0, f: 0, midashi: '② カード', pic: kiri('d1_hyou', 'sensei_d1') },
      { s: 1, f: 0, pic: zen('card_d1') },
      { s: 3, f: 0, pic: kiri('card_d1_card', 'card_d1', mk('card_d1_card', { waku: 'waku' })) },
      { s: 4, f: 0, pic: zen('card_d1') },
    ],
    ten3: [
      { s: 0, f: 0, midashi: '③ 先生の画面', pic: zen('sensei_d1') },
      { s: 0, f: 0.5, pic: kiri('d1_shirushi', 'sensei_d1', { waku: G.d1_shirushi.marks.waku }) },
      { s: 1, f: 0, pic: kiri('d1_kasetsu_ue', 'sensei_d1', { waku: [...G.d1_kasetsu_ue.marks.kasetsu, ...G.d1_kasetsu_ue.marks.kakunin] }) },
      { s: 2, f: 0, pic: zen('tsutae_d1') },
      { s: 3, f: 0, seq: [[kiri('type_0', 'tsutae_d1'), 1.2], [kiri('type_1', 'tsutae_d1'), 1.0], [kiri('type_2', 'tsutae_d1'), 0.5], [kiri('type_3', 'tsutae_d1'), 0]] },
      { s: 4, f: 0, midashi: '④ 育てる', pic: zen('sodateru_d1') },
      { s: 5, f: 0, pic: kiri('sodateru_kyou', 'sodateru_d1') },
    ],
    fukasa: [
      { s: 0, f: 0, midashi: 'Claude と深さ', pic: zen('kiku_zen', mk('kiku_zen', { waku: 'ichibun' })) },
      { s: 2, f: 0, pic: kiri('riyuu_kiroku', null) },
      { s: 3, f: 0, pic: hikaku(false) },
      { s: 5, f: 0, pic: hikaku(true) },
      { s: 6, f: 0, pic: sakeruHtml },
      { s: 7, f: 0, shita: KASANE.kakuuData, pic: senHyou(false) },
      { s: 8, f: 0, shita: KASANE.kakuuData, pic: senHyou(true) },
    ],
    ketsu: [
      { s: 0, f: 0, pic: kiri('settei_keikaku', 'sensei_top') },
      { s: 2, f: 0, ue: KASANE.kouka, pic: zen('home') },
    ],
    saigo: [{ s: null, f: 0, pic: saigo }],
  };
}

// 冒頭の絵が無いときは、同じ形（黒地に 100 人の点・19 人に色）で描く
function eWoYomu() {
  if (existsSync(E_SVG)) return { svg: readFileSync(E_SVG, 'utf8'), dare: E_SVG };
  const c = [];
  for (let i = 0; i < 100; i++) c.push(`<circle cx="${510 + (i % 10) * 100}" cy="${300 + Math.floor(i / 10) * 52}" r="20" fill="${i < 19 ? '#F2A33A' : '#3A3F47'}"/>`);
  const t = (y, s, size, fill = '#F4F4F2') => `<text x="960" y="${y}" text-anchor="middle" font-family="BIZ UDPGothic, sans-serif" font-size="${size}" fill="${fill}">${s}</text>`;
  return {
    dare: '描いた（同じ形）',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#0E0F12"/>${t(150, '文章を読んで、理解し、使うことに難しさを抱える 15 歳は、', 52)}${t(225, '100 人に <tspan fill="#F2A33A" font-size="68">19</tspan> 人。', 52)}${c.join('')}${t(900, '大人でも、決して少なくない。', 44)}${t(970, '15 歳：読解力が基礎的な水準（レベル2）に届かない 18.6%（PISA 2025・国立教育政策研究所）', 24, '#9AA0A8')}${t(1010, '大人：読解力レベル1以下 10%（PIAAC 2023・OECD）。足し合わせていません。', 24, '#9AA0A8')}</svg>`,
  };
}

// ---- 4. 時間割を作り、つなぐ
function jikanwari(nagasa, cues) {
  const kukan = [];
  let fAll = 0;
  for (const sec of [...DAIHON, { id: 'saigo', na: '最後の一枚', bun: [] }]) {
    const bun = sec.bun.map((koe, i) => ({ key: `${sec.id}_${i + 1}`, koe, jimaku: jimakuOf(koe), d: nagasa[`${sec.id}_${i + 1}`] }));
    let t = sec.id === 'saigo' ? 0 : ATAMA;
    bun.forEach((b, i) => { b.t0 = t; t += b.d + (i < bun.length - 1 ? AIDA : 0); });
    const len = sec.id === 'saigo' ? SAIGO : t;
    const f0 = fAll;
    const fLen = Math.round(len * FPS);
    const fr = (x) => f0 + Math.min(fLen, Math.round(x * FPS));
    // 字幕の札（文ごと。長い文は2枚。字数の割合で時間を分ける）
    const mai = [];
    bun.forEach((b, i) => {
      const ms = jimakuNoMai(b.jimaku);
      const w = ms.map((m) => haba(m.join('')));
      const sum = w.reduce((a, x) => a + x, 0);
      let acc = 0;
      const owari = i < bun.length - 1 ? bun[i + 1].t0 : len;
      ms.forEach((m, k) => {
        const s = b.t0 + (b.d * acc) / sum;
        acc += w[k];
        mai.push({ f: fr(s), lines: m, owari: k === ms.length - 1 ? fr(owari) : null });
      });
    });
    mai.forEach((m, k) => { if (m.owari == null) m.owari = mai[k + 1].f; });
    // 絵の切りかわり
    const e = [];
    let midashi = sec.midashi || '';
    for (const c of cues[sec.id]) {
      if (c.midashi) midashi = c.midashi;
      const t0 = c.s == null || (c.s === 0 && c.f === 0) ? 0 : bun[c.s].t0 + c.f * bun[c.s].d;
      const notes = { midashi, hayaokuri: c.hayaokuri ? KASANE.hayaokuri : '', ue: c.ue || '', shita: c.shita || '', kakuu: sec.id === 'shou' ? KASANE.kakuu : '' };
      if (c.seq) {
        let tt = t0;
        for (const [pic, d] of c.seq) { e.push({ f: fr(tt), pic, notes }); tt += d; }
      } else e.push({ f: fr(t0), pic: c.pic, notes });
    }
    // 切れ目ごとの一コマ
    const kireme = [...new Set([f0, f0 + fLen, ...e.map((x) => x.f), ...mai.flatMap((m) => [m.f, m.owari])])].filter((x) => x >= f0 && x <= f0 + fLen).sort((a, b) => a - b);
    const koma = [];
    for (let k = 0; k < kireme.length - 1; k++) {
      const a = kireme[k], b = kireme[k + 1];
      if (b <= a) continue;
      const ev = e.filter((x) => x.f <= a).pop() || e[0];
      const jm = mai.find((m) => m.f <= a && a < m.owari);
      koma.push({ f: a, n: b - a, spec: { bg: sec.bg, pic: ev.pic, ...ev.notes, jimaku: jm ? jm.lines : [] } });
    }
    kukan.push({ id: sec.id, na: sec.na, f0, fLen, bun: bun.map((b) => ({ ...b, f: fr(b.t0) })), mai, koma });
    fAll += fLen;
  }
  return { kukan, fAll };
}

function ff(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg が止まりました：${args.join(' ')}`);
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,sample_rate,nb_frames', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
}

async function main() {
  rmSync(KOMA, { recursive: true, force: true });
  mkdirSync(SAGYOU, { recursive: true });
  console.log('1. 声を作る');
  const nagasa = koeWoTsukuru();
  console.log('2. 画面を写す');
  const G = await gamenWoUtsusu();
  const e = eWoYomu();
  console.log(`   冒頭の絵：${e.dare}`);
  console.log('3. 時間割と一コマずつの絵');
  const { kukan, fAll } = jikanwari(nagasa, eNoNarabi(G, e.svg));
  // 字幕と重ねる文を、言葉の正本で点検する（避ける言葉の一覧の場面そのものは除く）
  const tenkenSuru = [...kukan.flatMap((k) => k.bun.map((b) => b.jimaku)), ...Object.values(KASANE).flat().filter((x) => x !== KASANE.sakeruDai), ...['① 見つける', '② カード', '③ 先生の画面', '④ 育てる', 'Claude と深さ']];
  const senMd = readFileSync(path.join(ROOT, 'docs', '線の比べ_6便.md'), 'utf8');
  const hits = [...tenkenSuru.flatMap((s) => tenken(s).map((h) => `${h['言葉']}（${s}）`)), ...tenken(senMd).map((h) => `${h['言葉']}（線の表）`), ...tenken(e.svg).map((h) => `${h['言葉']}（冒頭の絵）`)];
  if (hits.length) throw new Error(`避ける言葉が見つかりました：${hits.join('／')}`);
  const specs = kukan.flatMap((k) => k.koma.map((x) => x.spec));
  const komaNoFile = await komaWoKumu(specs);
  console.log(`   一コマの絵 ${new Set(specs.map((s) => komaNoFile(s))).size} 枚`);

  console.log('4. 区間ごとに mp4 にして、つなぐ');
  const kukanMp4 = [];
  for (const k of kukan) {
    const list = path.join(SAGYOU, `${k.id}.txt`);
    const lines = ['ffconcat version 1.0'];
    for (const x of k.koma) lines.push(`file '${komaNoFile(x.spec)}'`, `duration ${(x.n / FPS).toFixed(6)}`);
    lines.push(`file '${komaNoFile(k.koma[k.koma.length - 1].spec)}'`);
    writeFileSync(list, lines.join('\n') + '\n');
    const out = path.join(SAGYOU, `${k.id}.mp4`);
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS},format=yuv420p`, '-frames:v', String(k.fLen), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-r', String(FPS), '-video_track_timescale', '15360', out]);
    kukanMp4.push(out);
  }
  const tsunagi = path.join(SAGYOU, 'tsunagi.txt');
  writeFileSync(tsunagi, kukanMp4.map((f) => `file '${f}'`).join('\n') + '\n');
  const eizou = path.join(SAGYOU, 'eizou.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', tsunagi, '-c', 'copy', eizou]);

  // 声：文の頭のコマに合わせて置く
  const perF = SAMPLE / FPS;
  const oto = new Int16Array(fAll * perF);
  for (const k of kukan) for (const b of k.bun) oto.set(wavNoNakami(path.join(KOE, `${b.key}.wav`)).subarray(0, oto.length - b.f * perF), b.f * perF);
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
  const kekka = {
    ファイル: DEKIAGARI,
    長さ: Number(pr.format.duration).toFixed(2),
    大きさ: `${(statSync(DEKIAGARI).size / 1024 / 1024).toFixed(1)} MB`,
    流れ: pr.streams.map((s) => s.codec_name === 'aac' ? `aac ${s.sample_rate}Hz` : `${s.codec_name} ${s.width}×${s.height} ${s.r_frame_rate}`),
    区間: kukan.map((k) => ({ 区間: k.na, 秒: (k.fLen / FPS).toFixed(2), 声: k.bun.reduce((a, b) => a + b.d, 0).toFixed(2) })),
    同じ文章の読む版と聞く版: G.onajiMondai,
    字幕の点検: '避ける言葉 0 件',
    冒頭の絵: e.dare,
  };
  writeFileSync(path.join(SAGYOU, 'kekka.json'), JSON.stringify(kekka, null, 1));
  writeFileSync(path.join(SAGYOU, 'jimaku.txt'), kukan.flatMap((k) => k.mai.map((m) => `${(m.f / FPS).toFixed(2)}\t${m.lines.join(' / ')}`)).join('\n') + '\n');
  console.log(JSON.stringify(kekka, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e); process.exit(1); });
