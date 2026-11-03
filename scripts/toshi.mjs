// 通し確認：スマホの幅で ①→②→③→④→⑤→⑥ を最後まで動かし、
// 各画面の文を言葉の正本で点検し、横にはみ出していないかを確かめる。
// 使い方：npm run toshi（Playwright と Chromium が入っている端末で）
// キー無し（予備の動き）で確かめる。キーありで確かめるときは TOSHI_KEY_ARI=1 を付ける。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tenken } from '../lib/kotoba.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const OUT = process.env.TOSHI_OUT || path.join(ROOT, '.toshi');
mkdirSync(OUT, { recursive: true });

const PORT = 8799;
const env = { ...process.env, PORT: String(PORT) };
if (!process.env.TOSHI_KEY_ARI) env.CHIKARA_KEY_NASHI = '1';
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.once('data', r));

const BASE = `http://localhost:${PORT}/?shiken=1`;
const kiroku = { 画面: 0, 点検した文の数: 0, 避ける言葉: [], はみ出し: [], 理由: [], まちがい: [] };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => kiroku.まちがい.push(String(e)));

function tashika(jouken, setsumei) {
  if (!jouken) {
    kiroku.まちがい.push(setsumei);
    console.log(`× ${setsumei}`);
  } else console.log(`○ ${setsumei}`);
}

async function mieru(name) {
  await page.waitForTimeout(150);
  const text = await page.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('textarea')].map((t) => t.value).join('\n'));
  const lines = text.split('\n').filter((s) => s.trim());
  kiroku.画面++;
  kiroku.点検した文の数 += lines.length;
  for (const l of lines) for (const h of tenken(l)) kiroku.避ける言葉.push({ 画面: name, 文: l });
  for (const l of lines) if (/はなすスイッチ|じっくりスイッチ|上がった|伸びた/.test(l)) kiroku.避ける言葉.push({ 画面: name, 文: l, わけ: '出さないカード・言葉' });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) kiroku.はみ出し.push({ 画面: name, はみ出し: over });
  await page.screenshot({ path: path.join(OUT, `${String(kiroku.画面).padStart(2, '0')}_${name}.png`), fullPage: true });
  return text;
}

async function vis(sel) {
  const l = page.locator(sel).first();
  return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled().catch(() => true));
}

// ゲームを n 回の操作だけ進める（カードへのリンクが出たら止まる）
async function susumu(maxStep) {
  let tejun = 0;
  let mondai = 0;
  while (tejun++ < 400) {
    if (await vis('a[href^="#/card/"]')) return 'owari';
    if (await vis('#hajimeru')) {
      if (mondai >= maxStep) return 'tochuu';
      const r = await page.locator('#riyuu').innerText();
      kiroku.理由.push(r);
      if (mondai === 2) await mieru('ゲーム_理由');
      await page.click('#hajimeru');
      mondai++;
      continue;
    }
    if (await vis('#next')) { await page.click('#next'); continue; }
    if (await vis('#play')) { await page.click('#play'); await page.waitForTimeout(80); continue; }
    if (await vis('.marubatsu button')) {
      if (mondai === 3 && tejun % 7 === 0) await mieru('ゲーム_問い');
      await page.locator('.marubatsu button').nth(tejun % 2).click();
      continue;
    }
    if (await vis('.choice')) {
      await mieru('ゲーム_選ぶ');
      await page.locator('.choice').first().click();
      continue;
    }
    await page.waitForTimeout(100);
  }
  return 'tsumatta';
}

try {
  // はじめの画面
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('text=保存した結果を見る');
  const t0 = await mieru('はじめ');
  tashika(/AI（Anthropic の Claude）を使っています/.test(t0), 'AI を使っていることが画面に出る');

  // ① 案内
  await page.click('text=その場で動かす');
  await page.waitForSelector('text=このゲームについて');
  const tKo = await mieru('案内_子ども');
  await page.goto(`${BASE}#/annai/hogo`);
  await page.waitForSelector('text=保護者のみなさまへ');
  const tHogo = await mieru('案内_保護者');
  const soudan = 'このゲームの結果があってもなくても、相談はできます。';
  tashika(tKo.includes(soudan) && tHogo.includes(soudan), '相談先の文が子ども・保護者の両方に同じ文で出る');

  // ② ゲーム（途中で止めて、再開する）
  await page.goto(`${BASE}#/annai/ko`);
  await page.click('text=ゲームをはじめる');
  await page.waitForSelector('#hajimeru');
  const r1 = await susumu(5);
  tashika(r1 === 'tochuu', 'ゲームを5問まで進めた');
  await page.click('#tomeru');
  await page.waitForSelector('text=ここで止めました');
  await mieru('ゲーム_止めた');
  await page.goto(`${BASE}#/`);
  await page.reload();
  await page.waitForSelector('text=途中で止めたゲーム');
  await mieru('はじめ_続きあり');
  await page.click('text=の続きから始める');
  await page.waitForSelector('#hajimeru');
  const prog = await page.evaluate(() => document.querySelector('.progress > div').style.width);
  tashika(prog !== '0%', `続きから再開できる（進み具合 ${prog}）`);
  const r2 = await susumu(99);
  tashika(r2 === 'owari', 'ゲームを最後まで通せた');
  tashika(kiroku.理由.every((r) => r.length > 10), `次を選んだ理由が毎回画面に出る（${kiroku.理由.length}回）`);
  await mieru('ゲーム_おわり');

  // ③ カード
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  const tCard = await mieru('カード');
  tashika((await page.locator('.switch-card').count()) === 1, 'カードが1枚出る');
  tashika(!/\d+\s*枚/.test(tCard), 'カードの枚数が出ない');
  tashika(/これは何か/.test(tCard) && /自分でできる使い方/.test(tCard) && /先生にお願いしてよいこと/.test(tCard), 'カードの説明が3つある');

  // ④ 先生の画面
  await page.click('text=ここからは先生が見ます');
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tSensei = await mieru('先生の画面');
  tashika(/仮説/.test(tSensei) && /確かめた回数/.test(tSensei) && /参考程度・決めるのは先生/.test(tSensei), '仮説に「仮説」「確かめた回数」「参考程度・決めるのは先生」が付く');
  tashika(/\(a\)/.test(tSensei) && /\(b\) 選んだ答え/.test(tSensei) && /\(c\)/.test(tSensei) && /\(d\) Claude の仮説/.test(tSensei), '先生の画面に (a)〜(d) が出る');
  const kidId = decodeURIComponent(page.url().split('/').pop());

  // ④' チェック項目：この子を1つ選ぶ
  await page.goto(`${BASE}#/check`);
  await page.waitForSelector('.chip');
  await mieru('チェック項目');
  await page.locator(`.chip[data-item="c04"][data-kid="${kidId}"]`).click();
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tSensei2 = await mieru('先生の画面_チェック後');
  tashika(tSensei2.includes('口で聞くと答えるが、書くと止まる'), 'チェック項目が先生の画面の (c) に出る');

  // ⑤ 伝え方
  await page.click('text=⑤ 伝え方の下書きへ');
  await page.waitForSelector('#kondan', { timeout: 60000 });
  await page.click('#tenken');
  await page.waitForSelector('#tenken-kekka p');
  const tTsutae = await mieru('伝え方');
  tashika(/避ける言葉は見つかりませんでした/.test(tTsutae), '伝え方の下書きが点検を通る');

  // ⑥ 学習につなぐ
  await page.click('a.btn:has-text("⑥ 学習につなぐ")');
  await page.waitForSelector('.choice');
  await page.locator('.choice').nth(1).click();
  await page.waitForSelector('#kotae .box');
  await mieru('学習につなぐ');

  // 回をまたぐ：同じ子で、別の日の回をもう1回する → 読み直しても2回分が残る
  await page.goto(`${BASE}#/card/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#tsugi-kai');
  await page.click('#tsugi-kai');
  await page.waitForSelector('#hajimeru');
  tashika(/2回目/.test(await page.locator('h1').innerText()), '別の日の回（2回目）を始められる');
  const r3 = await susumu(99);
  tashika(r3 === 'owari', '2回目のゲームも最後まで通せた');
  await page.reload();
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tKai = await mieru('先生の画面_2回');
  tashika(/終わったゲーム：2回/.test(tKai) && /回ごとの「出し方の差」/.test(tKai) && /2回目/.test(tKai), '読み直しても2回分が残り、回ごとの差の表が出る');
  tashika(/ゲーム 2回で/.test(tKai), '仮説の「確かめた回数」に回の数が入る');

  // 保存した結果を見る（デモの子：1回だけの3人と、3回分の3人）
  const KITAI = { デモ1: /きくスイッチ/, デモ2: /どれでもスイッチ/, デモ3: /ずスイッチ/, デモ4: /きくスイッチ/, デモ5: /どれでもスイッチ/, デモ6: /どれでもスイッチ/ };
  for (const id of Object.keys(KITAI)) {
    await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(id)}`);
    await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
    const t = await mieru(`デモ_${id}_先生`);
    tashika(/参考程度・決めるのは先生/.test(t), `${id}：仮説に参考程度が付く`);
    await page.goto(`${BASE}#/card/${encodeURIComponent(id)}`);
    await page.waitForSelector('.switch-card');
    const c = await mieru(`デモ_${id}_カード`);
    tashika(!/\d+\s*枚/.test(c), `${id}：カードの枚数が出ない`);
    if (id === 'デモ6') {
      tashika(/持っているカード/.test(c) && (await page.locator('.switch-card').count()) === 2 && /1回目のゲーム（2026-09-09）のあとで、もらったカード/.test(c), `${id}：1回目にもらったカードが手元に残っている`);
    }
    if (id === 'デモ4') {
      tashika(KITAI[id].test(c) && /別々の日にした3日分のゲームのうち、3日分で、くり返し/.test(c), `${id}：くり返し出た候補のカードで、回の数が事実で書いてある`);
      tashika(/くり返し出た候補「聞く」/.test(t), `${id}：先生の画面に「くり返し出た候補」が出る`);
    } else {
      tashika(KITAI[id].test(c) && /この日のゲームでは/.test(c), `${id}：カードが結果に合い、「この日の」結果だと分かる`);
      tashika(!/くり返し出た候補「/.test(t), `${id}：くり返し出た候補にならない`);
    }
    await page.goto(`${BASE}#/tsutae/${encodeURIComponent(id)}`);
    await page.waitForSelector('#kondan', { timeout: 60000 });
    await mieru(`デモ_${id}_伝え方`);
  }
} catch (e) {
  kiroku.まちがい.push(String(e));
  await page.screenshot({ path: path.join(OUT, 'zz_error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  srv.kill();
}

console.log('\n=== 通し確認のまとめ ===');
console.log(`見た画面：${kiroku.画面}　点検した文の行：${kiroku.点検した文の数}　避ける言葉：${kiroku.避ける言葉.length}件　はみ出し：${kiroku.はみ出し.length}件`);
console.log(`ゲームで出た「次を選んだ理由」：${kiroku.理由.length}回`);
if (kiroku.避ける言葉.length) console.log(kiroku.避ける言葉);
if (kiroku.はみ出し.length) console.log(kiroku.はみ出し);
if (kiroku.まちがい.length) {
  console.log('うまくいかなかったこと：', kiroku.まちがい);
  process.exit(1);
}
if (kiroku.避ける言葉.length || kiroku.はみ出し.length) process.exit(1);
console.log('すべて通りました。画面の写し：', OUT);
