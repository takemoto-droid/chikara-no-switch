// 動画用の画面の素材を作る（画面写し 1920×1080・字が読めるよう 150% に拡大／音なしの画面録画）
// 使い方：npm run douga（Playwright と Chromium が要る）→ docs/動画素材/ に置く
// キーが無いあいだは「予備の動き（決まった順・決まった文）」の画面になる。キーが来たら、キーを入れて撮り直す。
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
      if (mondai === 3) { await utsusu('ゲーム_つぎの一文', 'ゲームの問題の上に「つぎは 〇〇」の一文が出る（理由の全文は先生の画面に残る）', '#riyuu'); utsushita = true; }
    }
    for (const sel of ['#tsuzukeru', '#next', '#play', '.marubatsu button', '.choice']) if (await vis(sel)) { await page.locator(sel).first().click(); break; }
    await page.waitForTimeout(40);
  }
  await utsusu('ゲームのおわり', 'ゲームのおわり：「スイッチカードを見る」');
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
  await utsusu('デモ7_育てたカード', '朝の練習で、支えを減らしながら育てたカード（デモの子7・架空）', 'h2:has-text("朝の練習で育てるスイッチ")');
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
  '> `npm run douga`（scripts/douga_sozai.mjs）で作りました。1920×1080、画面を 150% に拡大して写しています。',
  '> キーが無いあいだの画面なので、ゲームの理由・仮説・伝え方は「予備の動き（決まった文）」です。キーが来たら、キーを入れて撮り直します（`DOUGA_KEY_ARI=1 npm run douga`）。',
  '> デモの子は、すべて架空の子です。',
  '',
  '| ファイル | 場面 |',
  '|---|---|',
  ...shots.map((s) => `| ${s.file} | ${s.setsumei} |`),
  '| 画面録画_音なし.webm | 上の流れを通した画面録画（音なし） |',
  '',
].join('\n'));
console.log(`画面写し ${shots.length} 枚と画面録画を ${OUT} に置きました。`);
