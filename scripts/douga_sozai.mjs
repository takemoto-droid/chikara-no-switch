// 動画用の画面の素材を作る（画面写し 1920×1080・字が読めるよう 150% に拡大／音なしの画面録画）
// 使い方：npm run douga（Playwright と Chromium が要る）→ docs/動画素材/ に置く
// 20便：PC 幅（1920×1080）の、いまの画面の写し。撮影そのものは先生が公開デモで行い、これは字幕の見本や予備に使う。
// 制作の環境には鍵が無いので、ゲームと練習の理由は「予備の動き（決まった文）」になる（DOUGA_KEY_ARI=1 で鍵を使う）。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT } from '../lib/kotoba.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.join(ROOT, 'docs', '動画素材');
mkdirSync(OUT, { recursive: true });

const PORT = 8797;
const env = { ...process.env, PORT: String(PORT) };
if (!process.env.DOUGA_KEY_ARI) env.CHIKARA_KEY_NASHI = '1';
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.once('data', r));
const BASE = `http://localhost:${PORT}/?shiken=1`;
const enc = encodeURIComponent;

const browser = await chromium.launch();
// 1280×720 を 1.5 倍で写す → 1920×1080
const SIZE = { width: 1280, height: 720 };
const tmpVideo = path.join(OUT, '_video');
rmSync(tmpVideo, { recursive: true, force: true });
const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1.5, recordVideo: { dir: tmpVideo, size: { width: 1920, height: 1080 } } });
const page = await ctx.newPage();
const shots = [];
async function utsusu(name, setsumei, sel) {
  if (sel) {
    // 写したい所が画面に入りきらないときだけ、上へずらす
    await page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); if (r.bottom > window.innerHeight || r.top < 0) window.scrollBy(0, r.top - 80); });
  }
  await page.waitForTimeout(700);
  const file = `${String(shots.length + 1).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  shots.push({ file, setsumei });
}
const vis = async (sel) => { const l = page.locator(sel).first(); return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled().catch(() => true)); };

try {
  // 1. ゲームで Claude が次を選んだ理由（練習のあと、読む／聞くの本番に入るところ）
  await page.goto(`${BASE}#/hajimeru`);
  await page.waitForSelector('#riyuu');
  // 12便：「はじめる」は無く、問題の上の一文（#riyuu[data-step]）が変わったら次の問題
  let mondai = 0;
  let mae = null;
  let utsushita = false;
  for (let i = 0; i < 800; i++) {
    if (await vis('a[href^="#/card/"]')) break;
    if (!utsushita && (await vis('#riyuu[data-step]'))) {
      const step = await page.locator('#riyuu[data-step]').first().getAttribute('data-step');
      if (step !== mae) { mae = step; mondai++; }
      if (mondai === 3) { await utsusu('ゲーム_つぎの一文', 'ゲームの問題の上に「次は 〇〇」の一文が出る（理由の全文は先生の画面に残る）', '#riyuu'); utsushita = true; }
    }
    for (const sel of ['#tsuzukeru', '#next', '#play', '.marubatsu button', '.choice']) if (await vis(sel)) { await page.locator(sel).first().click(); break; }
    await page.waitForTimeout(40);
  }
  await utsusu('ゲームのおわり', 'ゲームのおわり：「カードを見る」');
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  await utsusu('スイッチカードを受け取る', 'スイッチカードを受け取る（強みだけ・枚数は出さない）', '.switch-card');

  // ⑥ 育てる：今日の練習と、選んだ理由（その場で動かした子）
  const kidHash = await page.evaluate(() => location.hash);
  const kid = decodeURIComponent((kidHash.match(/#\/card\/(.+)$/) || [])[1] || '');
  if (kid) {
    await page.goto(`${BASE}#/sodateru/${enc(kid)}`);
    await page.waitForSelector('#riyuu, .choice');
    if (await vis('.choice')) { await page.locator('.choice').first().click(); await page.waitForSelector('#riyuu'); }
    await utsusu('育てる_今日の練習', '⑥ 育てる（朝の練習）：今日の出し方と、選んだ理由。「今日はやらない」も選べる', '#riyuu');
  }

  // 練習でカードが育った子（デモ7）：一人前になったカード・練習の記録・前の回との違い
  await page.goto(`${BASE}#/card/${enc('デモ7')}`);
  await page.waitForSelector('.switch-card');
  await utsusu('デモ7_育てたカード', '朝の練習で、支えを減らしながら育てたカード（デモの子7・架空）', 'h2:has-text("育てているカード")');
  await page.goto(`${BASE}#/sensei/ko/${enc('デモ7')}`);
  await page.waitForSelector('#kasetsu .kasetsu');
  await utsusu('デモ7_先生の画面_練習の記録', '先生の画面：練習の記録（段・楽になったか・やらなかった日）', 'h2:has-text("練習の記録")');
  await page.goto(`${BASE}#/sensei`);
  await page.waitForSelector('#keikaku .label');
  await utsusu('先生の画面_設定と計画', '先生の画面：学校の設定と、期間の計画（参考程度・決めるのは先生）', 'h2:has-text("期間の計画")');

  // 2. 3回分の記録がある子（デモ4）：カード・先生の画面の仮説・回ごとの表
  await page.goto(`${BASE}#/card/${enc('デモ4')}`);
  await page.waitForSelector('.switch-card');
  await utsusu('デモ4_くり返しのカード', '3日分のゲームで、くり返し同じ向きの差が出た子のカード（デモの子4・架空）', '.switch-card');
  await page.goto(`${BASE}#/sensei/ko/${enc('デモ4')}`);
  await page.waitForSelector('#kasetsu .kasetsu');
  await utsusu('先生の画面_まとめと仮説', '先生の画面：まとめと Claude の仮説（参考程度・決めるのは先生）', '.narabi');
  await utsusu('先生の画面_回ごとの表', '先生の画面：回ごとの「出し方の差」の表（デモの子4）', 'h3:has-text("回ごとの")');

  // 3. 差が出なかった子のカード（デモ5）
  await page.goto(`${BASE}#/card/${enc('デモ5')}`);
  await page.waitForSelector('.switch-card');
  await utsusu('デモ5_差が出なかった子のカード', 'どの日も差が出なかった子にも、カードが届く（デモの子5・架空）', '.switch-card');

} finally {
  await ctx.close(); // ここで録画が書き出される
  await browser.close();
  srv.kill();
}

const vids = readdirSync(tmpVideo).filter((f) => f.endsWith('.webm'));
if (vids[0]) renameSync(path.join(tmpVideo, vids[0]), path.join(OUT, '画面録画_音なし.webm'));
rmSync(tmpVideo, { recursive: true, force: true });
writeFileSync(path.join(OUT, 'README.md'), [
  '# 動画素材（画面写し）',
  '',
  '> `npm run douga`（scripts/douga_sozai.mjs）で作りました。PC 幅（1280×720 の画面を 150% に拡大して 1920×1080）の、12便以降のいまの画面です（20便で作り直し）。',
  '> 動画は、鍵なしで動かした手元のアプリの本物の画面を `npm run douga:tsukuru` で写して作りました（Claude の文は、公開デモで Claude が書いて保存したもの）。この画像は、字幕の見本や予備に使います。',
  '> 制作の環境には鍵が無いので、ゲームの「次は 〇〇」と朝の練習の理由は、決まった文の「予備の動き」です。架空の子の仮説は、公開デモで Claude が書いて保存した文（11便）です。',
  '> デモの子は、すべて架空の子です。',
  '',
  '| ファイル | 場面 |',
  '|---|---|',
  ...shots.map((s) => `| ${s.file} | ${s.setsumei} |`),
  '| 画面録画_音なし.webm | 上の流れを通した画面録画（音なし） |',
  '',
  '## 3分の動画（24便で作り、25便・26便で直した）',
  '',
  '- `npm run douga:tsukuru`（scripts/douga_tsukuru.mjs）で、台本（資料の 23・第6版）どおりの3分以内の動画（1920×1080・30fps・H.264＋AAC）を作ります。mp4 は `.douga/` に置き、Git には入れません（先生に直接渡します）。',
  '- 声は台本の 28 文を合成の声 “Mei”（pyopenjtalk・speed 1.25・文の間 0.28 秒・区間の頭 0.5 秒・要点 6 文の後ろ +0.4 秒・最後の一枚 4 秒）で読みます（scripts/douga_koe.py）。読み違える2語（言ってね・区切って）だけ、合成に渡す読みをかなにしています。字幕は声と同じ文（「クロード」は「Claude」、漢数字は算用数字）を 52px・1 行 22 字までで、「。」で区切った文の途中では枚をまたぎません。',
  '- 画面は、鍵なし（CHIKARA_KEY_NASHI=1）で動かしたアプリの本物の写しです（起・承・結の教室の絵だけ、道具で描きます）。デモ1 の仮説と伝え方は、保存した Claude の文が出ます。次を選んだ理由の記録は、公開デモで Claude が書いた記録（資料 31）を、撮るときだけ端末の覚えに入れて写します。寄りや左右 2 枚の絵で字を大きくするため、一部の場面は幅 560 で開いた同じ画面（アプリの本物の折り返し）から写します。写す範囲に「予備の動き」・鍵・Vercel の表示が入ったら止まります。声の文・字幕・字幕・小・重ねる文は言葉の正本で点検し、1件でもあれば止まります。',
  '- 先生の声に差し替えるとき：`DOUGA_KOE_DIR=<フォルダ>` に `01_ki`・`02_sho`・`03_tenA`・`04_tenB`・`05_tenC`・`06_fukasa`・`07_ketsu`（m4a／mp3／wav）を置いて作り直すと、その区間だけ先生の声になります（無い区間は合成の声。字幕の時刻は区間の長さを文の字数で割り付けます）。3:00 を超えたら止まります（落とす文は先生が決めます）。',
  '- 要るもの：Playwright と Chromium・ffmpeg・字体 BIZ UDPGothic・pyopenjtalk の入った Python（`python3 -m venv .onsei-env && .onsei-env/bin/pip install pyopenjtalk` のあと `DOUGA_PYTHON=.onsei-env/bin/python npm run douga:tsukuru`）。',
  '',
].join('\n'));
console.log(`画面写し ${shots.length} 枚と画面録画を ${OUT} に置きました。`);
