// 通し確認：スマホの幅で ①→②→③→④→⑤→⑥→⑦ を最後まで動かし、
// 各画面の文を言葉の正本で点検し、横にはみ出していないかを確かめる。
// 使い方：npm run toshi（Playwright と Chromium が入っている端末で）
// キー無し（予備の動き）で確かめる。キーありで確かめるときは TOSHI_KEY_ARI=1 を付ける。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tenken, seihon } from '../lib/kotoba.mjs';

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
let page = await browser.newPage({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 1 });
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
  // 子どもの画面に、難しさの段階と「苦手」が出ていない（7便・R14）
  const dareNoGamen = await page.evaluate(() => document.getElementById('dare')?.textContent || '');
  if (/子どもの画面|大人が試す画面/.test(dareNoGamen)) {
    for (const l of lines) if (/段階|ふつうの文|3文の連絡|4文の連絡|物が1つの場面|物が2つの場面|苦手/.test(l)) kiroku.まちがい.push(`${name}：子どもの画面に段階か「苦手」がある「${l.slice(0, 40)}」`);
  }
  // 英語のままのエラーや空欄（undefined・null・NaN など）が画面に出ていない
  for (const l of lines) if (/\b(undefined|null|NaN|Error|TypeError|Failed to fetch)\b|\[object Object\]/.test(l)) kiroku.まちがい.push(`${name}：英語のまま・空欄の文「${l.slice(0, 40)}」`);
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
    if (await vis('#tsuzukeru')) { await mieru('ゲーム_ひと休み'); kiroku.yasumi = (kiroku.yasumi || 0) + 1; await page.click('#tsuzukeru'); continue; }
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

  // 子どもの安全とプライバシー（画面のいちばん下から開ける）
  await page.click('footer a[href="#/anzen"]');
  await page.waitForSelector('h1:has-text("子どもの安全とプライバシー")');
  const tAnzen = await mieru('子どもの安全とプライバシー');
  tashika(/2026-11-03/.test(tAnzen) && /support\.claude\.com/.test(tAnzen), '子どもの安全とプライバシーのページが画面から開ける');
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('text=保存した結果を見る');

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
  tashika(kiroku.yasumi === 1, '長い HR の途中に、休みの画面が1回出る');
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
  const jun = ['まとめ：いま言えること', 'Claude の仮説', '選んだ答え', 'チェック項目で当てはまったもの', '回ごとの「出し方の差」', '本人の中で、出し方ごとに比べたもの'].map((w) => tSensei.indexOf(w));
  tashika(jun.every((i) => i >= 0), '先生の画面に、結果・選んだ答え・チェック項目・Claude の仮説が出る');
  tashika(/比べた問題：/.test(tSensei), '先生の画面に「比べた問題」が事実で出る（段階は先生にだけ）');
  tashika(jun.every((i, k) => k === 0 || i > jun[k - 1]), '先生の画面は、まとめ→仮説→授業の手がかり→数字の根拠の順');
  const kidId = decodeURIComponent(page.url().split('/').pop());

  // ④' チェック項目：この子を1つ選ぶ
  await page.goto(`${BASE}#/check`);
  await page.waitForSelector('.chip');
  await mieru('チェック項目');
  await page.locator(`.chip[data-item="c04"][data-kid="${kidId}"]`).click();
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tSensei2 = await mieru('先生の画面_チェック後');
  tashika(tSensei2.includes('口で聞くと答えるが、書くと止まる'), 'チェック項目が先生の画面に出る');

  // ⑤ 伝え方
  await page.click('text=⑤ 伝え方の下書きへ');
  await page.waitForSelector('#kondan', { timeout: 60000 });
  await page.click('#tenken');
  await page.waitForSelector('#tenken-kekka p');
  const tTsutae = await mieru('伝え方');
  tashika(/避ける言葉は見つかりませんでした/.test(tTsutae), '伝え方の下書きが点検を通る');

  // 回をまたぐ：同じ子で、別の日の回をもう1回する → 読み直しても2回分が残る
  await page.goto(`${BASE}#/card/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#tsugi-kai');
  await page.click('#tsugi-kai');
  await page.waitForSelector('#hajimeru');
  const h1Mata = await page.locator('h1').innerText();
  tashika(/2回目/.test(h1Mata) && /また見つける/.test(h1Mata) && /短い版/.test(h1Mata), '⑦：カードの画面から、また見つける（短いゲーム・2回目）を始められる');
  await mieru('また見つける_はじめ');
  const r3 = await susumu(99);
  tashika(r3 === 'owari', '⑦：また見つけるの短いゲームも最後まで通せた');
  const tMataOwari = await mieru('また見つける_おわり');
  tashika(/なくなりません/.test(tMataOwari), '⑦：おわりの画面で、もらったカードはなくならないと伝える');
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  const tMataCard = await mieru('また見つける_カード');
  tashika(!/\d+\s*枚/.test(tMataCard) && !/合計|順位/.test(tMataCard), '⑦：カードの画面に、合計・順位・枚数が出ない');
  await page.reload();
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tKai = await mieru('先生の画面_2回');
  tashika(/終わったゲーム：2回/.test(tKai) && /回ごとの「出し方の差」/.test(tKai) && /2回目/.test(tKai), '読み直しても2回分が残り、回ごとの差の表が出る');
  tashika(/ゲーム 2回で/.test(tKai), '仮説の「確かめた回数」に回の数が入る');
  tashika(/前の回との違い/.test(tKai) && /また見つけるの短い版/.test(tKai), '⑦：先生の画面に、前の回との違いが事実で出る');

  // ⑥ 育てる（朝の練習）：今日の練習の理由 → ひとつずつ → 段が進んだ理由 → 楽になったか → そだてちゅうのカード
  const pool = JSON.parse(readFileSync(path.join(ROOT, 'public/data/renshu.json'), 'utf8'));
  const zenToi = [...pool.A.文章, ...pool.B.問題, ...pool.C.文章].flatMap((x) => x.問い);
  await page.goto(`${BASE}#/sodateru/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#riyuu, .choice');
  if (await vis('.choice')) { await mieru('育てる_出し方を選ぶ'); await page.locator('.choice').first().click(); await page.waitForSelector('#riyuu'); }
  const tKyou = await mieru('育てる_今日の練習');
  tashika(/今日の練習：/.test(tKyou) && /いまの段：/.test(tKyou) && (await page.locator('#riyuu').innerText()).length > 10, '⑥：今日の練習と、選んだ理由が画面に出る');
  tashika(await vis('#yasumu'), '⑥：「今日はやらない」を選べる');
  await page.click('#hajimeru');
  let susunda = false;
  for (let i = 0; i < 300; i++) {
    if (await vis('h1:has-text("おつかれさまでした")')) break;
    if (await vis('#tsugi')) { const t = await mieru('育てる_段が進んだ理由'); susunda ||= /2回続けて正解が多かったので/.test(t); await page.click('#tsugi'); continue; }
    if (await vis('#next')) { if (i === 1) await mieru('育てる_ひとつ'); await page.click('#next'); continue; }
    const toiBun = (await vis('.toi')) ? await page.locator('.toi').first().innerText() : '';
    const q = zenToi.find((x) => x.文 === toiBun.trim());
    if (await vis('.marubatsu button')) { await page.locator('.marubatsu button').nth(q && q.答え === false ? 1 : 0).click(); continue; }
    if (await vis('.choice')) { await page.locator('.choice').nth(q && Number.isInteger(q.答え) ? q.答え : 0).click(); continue; }
    await page.waitForTimeout(60);
  }
  tashika(susunda, '⑥：同じ段で2回続けて正解が多いと、段が進み、その理由が画面に出る');
  const tRaku = await mieru('育てる_楽になったか');
  tashika(/前より楽になった/.test(tRaku) && /今は答えない/.test(tRaku), '⑥：楽になったかを、選んで答える');
  await page.locator('.choice', { hasText: '同じくらい' }).click();
  await page.waitForSelector('.switch-card');
  const tSodate = await mieru('育てる_そだてちゅうのカード');
  tashika(/レベル：そだてちゅう/.test(tSodate) && /●●●○/.test(tSodate) && /を支えに、.+を育てている/.test(tSodate), '⑥：そだてちゅうのカードが現れ、レベル＝段（4つのうち3つ目）と副題が付く');
  await page.goto(`${BASE}#/card/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('.switch-card');
  const tCard2 = await mieru('カード_育てている');
  tashika(/朝の練習で育てるスイッチ/.test(tCard2) && /練習の記録/.test(tCard2) && /同じくらい/.test(tCard2), '⑥：カードの画面に、育てているスイッチと、本人の練習の記録が出る');
  tashika(!/\d+\s*枚/.test(tCard2), '⑥：カードの枚数が出ない');
  // 今日はやらない
  await page.goto(`${BASE}#/sodateru/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#yasumu');
  await page.click('#yasumu');
  const tYasumi = await mieru('育てる_今日はやらない');
  tashika(/今日はお休み/.test(tYasumi), '⑥：「今日はやらない」を選ぶと、練習しないで終わる');
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tRenshu = await mieru('先生の画面_練習の記録');
  tashika(/練習の記録（⑥ 育てる）/.test(tRenshu) && /育てているカード：/.test(tRenshu) && /「今日はやらない」を選んだ日：1日/.test(tRenshu) && /楽になったか/.test(tRenshu), '④(e)：先生の画面に、練習の記録（回数・段・楽になったか・やらなかった日）が出る');

  // 保存した結果を見る（デモの子：1回だけの3人と、3回分の3人）
  const KITAI = { デモ1: /きいてスイッチ/, デモ2: /どれでもスイッチ/, デモ3: /ずでスイッチ/, デモ4: /きいてスイッチ/, デモ5: /どれでもスイッチ/, デモ6: /どれでもスイッチ/, デモ7: /どれでもスイッチ/, デモ8: /ずでスイッチ/ };
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
    tashika(/— (読むと聞くを比べて|文と図を比べて|一気にと区切ってを比べて|3つの比べで差なし)/.test(c), `${id}：カードに、比べた2つの出し方の副題が付く`);
    tashika(/レベル：(みつけた|たしかめた|しっかり)/.test(c) && /レベル：/.test(t) === false, `${id}：カードにレベルが付く（先生の画面はカードの名前とレベルの名前だけ）`);
    if (id === 'デモ4') {
      tashika(/レベル：しっかり/.test(c) && /きいてスイッチ（しっかり）/.test(t), `${id}：3日で同じ向きのカードは、いちばん上のレベル`);
      tashika(KITAI[id].test(c) && /別々の日にした3日分のゲームのすべてで、くり返し/.test(c), `${id}：くり返し出た候補のカードで、回の数が事実で書いてある`);
      tashika(/くり返し出た候補「聞く」/.test(t), `${id}：先生の画面に「くり返し出た候補」が出る`);
    } else {
      tashika(KITAI[id].test(c) && /この日のゲームでは/.test(c), `${id}：カードが結果に合い、「この日の」結果だと分かる`);
      tashika(!/くり返し出た候補「/.test(t), `${id}：くり返し出た候補にならない`);
    }
    await page.goto(`${BASE}#/tsutae/${encodeURIComponent(id)}`);
    await page.waitForSelector('#kondan', { timeout: 60000 });
    const tT = await mieru(`デモ_${id}_伝え方`);
    if (id === 'デモ1') tashika(/HR の冒頭で先生が話すこと/.test(tT) && /今は答えない/.test(tT), '⑤：HR の冒頭で先生が話すことの下書きが出る');
    if (id === 'デモ7') {
      tashika(/朝の練習で育てるスイッチ/.test(c) && /よんでスイッチ/.test(c) && /レベル：一人前/.test(c) && /●●●●/.test(c) && /聞くを支えに、読むを育てた/.test(c) && /練習の記録/.test(c), 'デモ7：練習で育ったカードが一人前で出て、本人の練習の記録がある');
      tashika(/練習の記録（⑥ 育てる）/.test(t) && /「今日はやらない」を選んだ日：1日/.test(t) && /前の回との違い/.test(t), 'デモ7：先生の画面に、練習の記録と前の回との違いが出る');
      await page.goto(`${BASE}#/sodateru/${encodeURIComponent(id)}`);
      await page.waitForSelector('#riyuu');
      const tS = await mieru('デモ7_育てる');
      tashika(/読むだけ/.test(tS) && !(await vis('#hajimeru')), 'デモ7：⑥ 育てるは、段4（読むだけ）で、架空の子なので練習は始めない');
    }
    if (id === 'デモ8') tashika(/比べた問題：物が1つの場面/.test(t) && /比べた問題：短い文/.test(t), 'デモ8：先生の画面に、やさしい段階で比べたことが事実で出る（子どもの画面には出ない）');
  }

  // Should：引き継ぎの記録の書き出し（デモ4）
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ4')}`);
  await page.waitForSelector('#hikitsugi');
  await page.click('#hikitsugi');
  await page.waitForSelector('#hikitsugi-dl');
  await page.locator('#hikitsugi-box summary').click();
  const tHiki = await mieru('引き継ぎの記録_デモ4');
  tashika(/避ける言葉は見つかりませんでした/.test(tHiki) && /2026-10-28/.test(tHiki) && /2026年度/.test(tHiki), 'Should：引き継ぎの記録を書き出せる（回ごとの日付・年度つき）');

  // Should：大人が自分で試す
  await page.goto(`${BASE}#/`);
  await page.click('text=大人が自分で試す');
  await page.waitForSelector('text=大人の方へ');
  await mieru('案内_大人');
  await page.click('text=試してみる');
  await page.waitForSelector('#hajimeru');
  const rO = await susumu(99);
  tashika(rO === 'owari', 'Should：大人もゲームを最後まで通せる');
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  const tO = await mieru('カード_大人');
  tashika(/まわりにお願いしてよいこと/.test(tO) && !/先生にお願いしてよいこと/.test(tO), 'Should：大人のカードは「まわりにお願いしてよいこと」');
  tashika(tO.includes(seihon()['相談先の案内（大人が試すとき・結果に関係なく同じ文）']) && !tO.includes('担任の先生'), '大人の画面の相談先は、大人用の決まった文');

  // 学校の設定と期間の計画（先生の画面）。設定を変えると、保護者向けの案内の時間の文が変わる
  await page.goto(`${BASE}#/sensei`);
  await page.waitForSelector('#keikaku .label');
  const tHub = await mieru('先生の画面_設定と計画');
  tashika(/学校の設定/.test(tHub) && /期間の計画/.test(tHub) && /参考程度・決めるのは先生/.test(tHub) && /練習でカードが育った子/.test(tHub), '学校の設定と、期間の計画（予備は決まった計画）が先生の画面に出る');
  await page.selectOption('select[data-k="朝の練習の頻度"]', '毎日');
  await page.waitForTimeout(300);
  await page.goto(`${BASE}#/annai/hogo`);
  await page.waitForSelector('h2');
  const tHogo2 = await mieru('保護者の案内_設定を変えたあと');
  tashika(/毎日・1回10分/.test(tHogo2), '案内の時間の文が、学校の設定から出る');
  await page.goto(`${BASE}#/annai/ko`);
  await page.waitForSelector('h2');
  tashika(!/\d+\s*分/.test(await mieru('子どもの案内_設定を変えたあと')), '子ども向けの案内には、時間を言い切る文が無い');
  await page.goto(`${BASE}#/check`);
  await page.waitForSelector('.chip');
  tashika((await page.locator('.chip[data-kid^="大人"]').count()) === 0, 'Should：大人の記録は、クラスのチェック項目に出ない');

  // PC の幅（1280px）でも、先生の画面・チェック項目・伝え方が崩れない
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => kiroku.まちがい.push(String(e)));
  for (const [mei, hash, sel] of [['PC_先生の画面_デモ4', '#/sensei/ko/デモ4', '#kasetsu .kasetsu'], ['PC_先生の画面_デモ1', '#/sensei/ko/デモ1', '#kasetsu .kasetsu'], ['PC_チェック項目', '#/check', '.chip'], ['PC_伝え方_デモ4', '#/tsutae/デモ4', '#kondan'], ['PC_カード_デモ6', '#/card/デモ6', '.switch-card']]) {
    await page.goto(`${BASE}${hash.replace(/デモ(\d)/, (m) => encodeURIComponent(m))}`);
    await page.waitForSelector(sel, { timeout: 60000 });
    await mieru(mei);
  }
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent('デモ4')}`);
  await page.waitForSelector('#kasetsu .kasetsu');
  const narabu = await page.evaluate(() => { const s = [...document.querySelectorAll('.narabi > section')]; return s.length >= 2 && Math.abs(s[0].getBoundingClientRect().top - s[1].getBoundingClientRect().top) < 5; });
  tashika(narabu, 'PC の幅では、まとめと仮説が横に並ぶ');
} catch (e) {
  kiroku.まちがい.push(String(e));
  await page.screenshot({ path: path.join(OUT, 'zz_error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  srv.kill();
}

console.log('\n=== 通し確認のまとめ ===');
console.log(`見た画面：${kiroku.画面}（スマホの幅 375px と PC の幅 1280px）　点検した文の行：${kiroku.点検した文の数}　避ける言葉：${kiroku.避ける言葉.length}件　はみ出し：${kiroku.はみ出し.length}件`);
console.log(`ゲームで出た「次を選んだ理由」：${kiroku.理由.length}回`);
if (kiroku.避ける言葉.length) console.log(kiroku.避ける言葉);
if (kiroku.はみ出し.length) console.log(kiroku.はみ出し);
if (kiroku.まちがい.length) {
  console.log('うまくいかなかったこと：', kiroku.まちがい);
  process.exit(1);
}
if (kiroku.避ける言葉.length || kiroku.はみ出し.length) process.exit(1);
console.log('すべて通りました。画面の写し：', OUT);
