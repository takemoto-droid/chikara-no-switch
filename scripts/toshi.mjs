// 通し確認：スマホの幅で ①→②→③→④→⑤→⑥→⑦ を最後まで動かし、
// 各画面の文を言葉の正本で点検し、横にはみ出していないかを確かめる。
// 使い方：npm run toshi（Playwright と Chromium が入っている端末で）
// キー無し（予備の動き）で確かめる。キーありで確かめるときは TOSHI_KEY_ARI=1 を付ける。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const kiroku = { 字数: {}, 画面: 0, 点検した文の数: 0, 避ける言葉: [], はみ出し: [], 理由: [], まちがい: [] };
const browser = await chromium.launch();
// スマホの幅は、指で触る端末として開く（hasTouch）。マウスの hover が写しに混ざらないように
let page = await browser.newPage({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 1, hasTouch: true });
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
    for (const l of lines) if (/段階|ふつうの文|3文の連絡|4文の連絡|要素の少ない場面|要素の多い場面|苦手/.test(l)) kiroku.まちがい.push(`${name}：子どもの画面に段階か「苦手」がある「${l.slice(0, 40)}」`);
    // 12便：練習の「段」も子どもの画面に出さない（「やり方」と言う）。「階段」「2段目」（棚）は段のことではないので除く
    for (const l of lines) if (/(?<!階)段(?!目)/.test(l)) kiroku.まちがい.push(`${name}：子どもの画面に「段」がある「${l.slice(0, 40)}」`);
  }
  if (/子どもの画面/.test(dareNoGamen)) {
    // 12便 P2 (11)：子どもの画面1枚の固定文の字数（問題文・選択肢・カードの中身・練習の記録の表・図は除く。空白は数えない）
    const j = await page.evaluate(() => {
      const app = document.getElementById('app');
      const nozoku = '.switch-card, .honbun, .toi, .choice, table, svg, [data-kazoenai], #riyuu, .tsugi-ichibun, .riyuu';
      const top = [...app.querySelectorAll(nozoku)].filter((e) => !e.parentElement.closest(nozoku));
      const kazu = (t) => (t || '').replace(/\s/g, '').length;
      // 図（svg）には innerText が無いので textContent で数えて引く（13便のもと：図に「前から 〇列め」などの基準を書いたため）
      const kotei = kazu(app.innerText) - top.reduce((a, e) => a + kazu(e.innerText ?? e.textContent), 0);
      const ichibun = Math.max(0, ...[...app.querySelectorAll('#riyuu, .tsugi-ichibun, .riyuu')].map((e) => kazu(e.innerText)));
      return { kotei, ichibun };
    });
    kiroku.字数[name] = j;
    if (j.kotei > 60) kiroku.まちがい.push(`${name}：子どもの画面の固定文が ${j.kotei}字（上限60字）`);
    if (j.ichibun > 20) kiroku.まちがい.push(`${name}：つなぎ・理由の文が ${j.ichibun}字（上限20字）`);
    // 12便 P1：子どもの画面に「API キー」「予備の動き」が無い
    for (const l of lines) if (/API ?キー|予備の動き/.test(l)) kiroku.まちがい.push(`${name}：子どもの画面に「API キー」か「予備の動き」がある「${l.slice(0, 40)}」`);
  }
  // 英語のままのエラーや空欄（undefined・null・NaN など）が画面に出ていない
  for (const l of lines) if (/\b(undefined|null|NaN|Error|TypeError|Failed to fetch)\b|\[object Object\]/.test(l)) kiroku.まちがい.push(`${name}：英語のまま・空欄の文「${l.slice(0, 40)}」`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) kiroku.はみ出し.push({ 画面: name, はみ出し: over });
  await page.screenshot({ path: path.join(OUT, `${String(kiroku.画面).padStart(2, '0')}_${name}.png`), fullPage: true });
  return text;
}

// 折りたたみ（details）の中も含めた、#app の中身全体の文字
const zentai = () => page.evaluate(() => document.querySelector('#app').textContent);

async function vis(sel) {
  const l = page.locator(sel).first();
  return (await l.count()) > 0 && (await l.isVisible()) && (await l.isEnabled().catch(() => true));
}

// ゲームを n 問だけ進める（カードへのリンクが出たら止まる）。12便：「はじめる」は無く、問題の上の一文（#riyuu[data-step]）が変わったら次の問題
async function susumu(maxStep) {
  let tejun = 0;
  let mondai = 0;
  let mae = null;
  while (tejun++ < 600) {
    // 13便のもと：次の問題が決まるまでは、前の画面のまま（ボタンは押せない）。そのあいだは待つ
    if (await page.locator('#game-naka[aria-busy="true"]').count()) { await page.waitForTimeout(50); continue; }
    if (await vis('a[href^="#/card/"]')) return 'owari';
    if (await vis('#tsuzukeru')) {
      const tY = await mieru('ゲーム_ひと休み');
      kiroku.yasumi = (kiroku.yasumi || 0) + 1;
      kiroku.hitoyasumi = /半分まで来た/.test(tY) && (await vis('#hitoyasumi')) && !/止める/.test(tY);
      await page.click('#tsuzukeru');
      continue;
    }
    if (await vis('#riyuu[data-step]')) {
      const step = await page.locator('#riyuu[data-step]').first().getAttribute('data-step');
      if (step !== mae) {
        if (mondai >= maxStep) return 'tochuu';
        mae = step;
        kiroku.理由.push(await page.locator('#riyuu').innerText());
        if (mondai === 2) await mieru('ゲーム_理由');
        mondai++;
      }
    }
    if (await vis('#next')) { if (!kiroku.honbunMita && (await vis('.honbun'))) { kiroku.honbunMita = true; await mieru('ゲーム_本文'); } await page.click('#next'); continue; }
    if (await vis('#play')) { await page.click('#play'); await page.waitForTimeout(80); continue; }
    if (await vis('.marubatsu button')) {
      if (!kiroku.toiMita) { kiroku.toiMita = true; await mieru('ゲーム_問い'); }
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
  await page.click('footer .ai-zen a[href="#/anzen"]');
  await page.waitForSelector('h1:has-text("子どもの安全とプライバシー")');
  const tAnzen = await mieru('子どもの安全とプライバシー');
  tashika(/2026-11-03/.test(tAnzen) && /support\.claude\.com/.test(tAnzen), '子どもの安全とプライバシーのページが画面から開ける');
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('text=保存した結果を見る');

  // ① 案内
  await page.click('text=その場で動かす');
  await page.waitForSelector('.annai-ichibun');
  // 12便 P2：子ども向けの案内は一画面一文。「つぎへ」で進み、最後に「はじめる」。どの画面にも同じ短い相談先
  const YOBINA = seihon()['相談先の呼び名（学校の設定で選ぶ・はじめの値）'];
  const SOUDAN_KO = seihon()['相談先の案内（子どもの画面・短い文・結果に関係なく全員に同じ文）'].replaceAll('{相談先}', YOBINA);
  let tKo = '';
  let tSaigo = '';
  for (let i = 0; i < 8; i++) {
    tSaigo = await mieru(`案内_子ども_${i + 1}`);
    tKo += tSaigo;
    if (await vis('#annai-tsugi')) await page.click('#annai-tsugi');
    else break;
  }
  tashika(tSaigo.includes(SOUDAN_KO) && (await vis('a[href="#/hajimeru"]')) && /名前は 送りません/.test(tKo) && /今は答えない/.test(tKo), '子ども向けの案内：一画面一文で進み、AI のこと・「今は答えない」があり、「はじめる」の画面に全員に同じ短い相談先がある');
  await page.goto(`${BASE}#/annai/hogo`);
  await page.waitForSelector('text=保護者のみなさまへ');
  const tHogo = await mieru('案内_保護者');
  tashika(tHogo.includes(seihon()['相談先の案内（結果に関係なく全員に同じ文）'].replaceAll('{相談先}', YOBINA)) && tSaigo.includes('担任の先生かカウンセラーの先生に話してね'), '保護者の画面には、全員に同じ相談先の文が出る');
  // 2026-11-05（先生の決定）：相談先の呼び名は学校の設定で選べる。子どもの画面と保護者の案内の両方に同じ呼び名が入る
  await page.goto(`${BASE}#/sensei`);
  await page.waitForSelector('select[data-k="相談先の呼び名"]');
  await page.selectOption('select[data-k="相談先の呼び名"]', '相談室');
  await page.waitForTimeout(200);
  await page.goto(`${BASE}#/annai/hogo`);
  await page.waitForSelector('text=保護者のみなさまへ');
  const tHogoYobina = await page.evaluate(() => document.body.innerText);
  await page.goto(`${BASE}#/annai/ko`);
  for (let i = 0; i < 8 && (await vis('#annai-tsugi')); i++) await page.click('#annai-tsugi');
  const tKoYobina = await page.evaluate(() => document.body.innerText);
  tashika(/担任の先生や、相談室に話してください/.test(tHogoYobina) && /担任の先生か相談室に話してね/.test(tKoYobina), '相談先の呼び名を学校の設定で「相談室」にすると、子どもの画面と保護者の案内の両方に入る');
  await page.goto(`${BASE}#/sensei`);
  await page.waitForSelector('select[data-k="相談先の呼び名"]');
  await page.selectOption('select[data-k="相談先の呼び名"]', YOBINA);
  await page.waitForTimeout(200);

  // ② ゲーム（途中で止めて、再開する）
  await page.goto(`${BASE}#/annai/ko`);
  for (let i = 0; i < 8 && (await vis('#annai-tsugi')); i++) await page.click('#annai-tsugi');
  await page.click('a[href="#/hajimeru"]');
  await page.waitForSelector('#riyuu');
  const r1 = await susumu(5);
  tashika(r1 === 'tochuu', 'ゲームを5問まで進めた');
  tashika((await page.locator('#tomeru').innerText()) === 'ひと休み' && !(await page.locator('#app').innerText()).includes('止める'), '問題の画面の右下は「ひと休み」（「止める」は無い）');
  const kazuMae = await page.locator('.progress-kazu').innerText();
  await page.click('#tomeru');
  await page.waitForSelector('text=ひと休み中');
  await mieru('ゲーム_止めた');
  // 21便 U1：ひと休みの画面の「続きから」で、ひと休みした問題から再開する（アドレスが同じでも画面が変わる）
  await page.click('#tsuzukikara');
  await page.waitForSelector('#tomeru', { timeout: 10000 }).catch(() => {});
  const kazuAto = (await vis('.progress-kazu')) ? await page.locator('.progress-kazu').innerText() : '';
  tashika(kazuAto === kazuMae && !(await page.locator('#app').innerText()).includes('ひと休み中'), `ゲーム中に「ひと休み」→「続きから」を押すと、ひと休みした問題から再開する（${kazuMae} → ${kazuAto || 'なし'}）`);
  await page.click('#tomeru');
  await page.waitForSelector('text=ひと休み中');
  await page.goto(`${BASE}#/`);
  await page.reload();
  await page.waitForSelector('text=ひと休み中のゲーム');
  await mieru('はじめ_続きあり');
  await page.click('text=の続きから始める');
  await page.waitForSelector('#riyuu');
  const prog = await page.evaluate(() => document.querySelector('.progress > div').style.width);
  tashika(prog !== '0%', `続きから再開できる（進み具合 ${prog}）`);
  const r2 = await susumu(99);
  tashika(r2 === 'owari', 'ゲームを最後まで通せた');
  tashika(kiroku.yasumi === 1, '長い HR の途中に、休みの画面が1回出る');
  tashika(kiroku.hitoyasumi === true, '休みの画面：「半分まで来た。あと少し！」と「続ける」「ひと休み」（「止める」は無い）');
  tashika(kiroku.理由.every((r) => /^次は /.test(r) && r.length <= 20), `問題の上に「次は 〇〇」の一文（20字以内）が毎回出る（${kiroku.理由.length}回）`);
  await mieru('ゲーム_おわり');

  // ③ カード
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  const tCard = await mieru('カード');
  tashika((await page.locator('.switch-card').count()) === 1, 'カードが1枚出る');
  tashika(!/\d+\s*枚/.test(tCard), 'カードの枚数が出ない');
  const tCardZen = await zentai();
  tashika(/これは何か/.test(tCardZen) && /自分でできる使い方/.test(tCardZen) && /先生にお願いしてよいこと/.test(tCardZen) && /くわしく/.test(tCard), 'カードの説明が3つある（「くわしく」で開く）');
  tashika(/別の日は 違うかも/.test(tCard) && /力が 出せ(るかも|そう|る)|いろいろな出し方で 考えてみた/.test(tCard), 'カードに、レベルに合う一文と「別の日は 違うかも。」が出る');

  // ④ 先生の画面
  await page.click('text=先生が見る画面へ');
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
  await page.waitForSelector('#mata-waku');
  await page.click('#mata-waku summary');
  await page.click('#tsugi-kai');
  await page.waitForSelector('#riyuu');
  const navMata = await page.locator('#michi').innerText();
  const zenMata = await page.locator('.progress-kazu').innerText();
  tashika(/いま：⑦/.test(navMata) && /／12$/.test(zenMata), `⑦：カードの画面から、また見つける（短いゲーム・12問）を始められる（ナビ「${navMata}」・${zenMata}）`);
  await mieru('また見つける_はじめ');
  const r3 = await susumu(99);
  tashika(r3 === 'owari', '⑦：また見つけるの短いゲームも最後まで通せた');
  const tMataOwari = await mieru('また見つける_おわり');
  tashika(/なくならない/.test(tMataOwari), '⑦：おわりの画面で、もらったカードはなくならないと伝える');
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
  tashika(/今日の練習：/.test(tKyou) && /今日の やり方：/.test(tKyou) && (await page.locator('#riyuu').innerText()).length >= 5, '⑥：今日の練習・今日の やり方と、選んだ理由が画面に出る（「段」と言わない）');
  tashika(await vis('#yasumu'), '⑥：「今日はやらない」を選べる');
  await page.click('#hajimeru');
  let susunda = false;
  for (let i = 0; i < 300; i++) {
    if (await vis('h1:has-text("おつかれさま")')) break;
    if (await vis('#tsugi')) { const t = await mieru('育てる_つぎのやり方の理由'); susunda ||= /次の やり方に 進んだ わけ/.test(t) && /2回 続けて、正解が 多かったから/.test(t) && /次の やり方：/.test(t); await page.click('#tsugi'); continue; }
    if (await vis('#next')) { if (i === 1) await mieru('育てる_ひとつ'); await page.click('#next'); continue; }
    const toiBun = (await vis('.toi')) ? await page.locator('.toi').first().innerText() : '';
    const q = zenToi.find((x) => x.文 === toiBun.trim());
    if (await vis('.marubatsu button')) { await page.locator('.marubatsu button').nth(q && q.答え === false ? 1 : 0).click(); continue; }
    if (await vis('.choice')) { await page.locator('.choice').nth(q && Number.isInteger(q.答え) ? q.答え : 0).click(); continue; }
    await page.waitForTimeout(60);
  }
  tashika(susunda, '⑥：同じやり方で2回続けて正解が多いと、つぎの やり方に進み、その理由が画面に出る');
  const tRaku = await mieru('育てる_楽になったか');
  tashika(/前より楽になった/.test(tRaku) && /今は答えない/.test(tRaku), '⑥：楽になったかを、選んで答える');
  await page.locator('.choice', { hasText: '同じくらい' }).click();
  await page.waitForSelector('.switch-card');
  const tSodate = await mieru('育てる_そだてちゅうのカード');
  tashika(/レベル：育て中/.test(tSodate) && /●●●○/.test(tSodate) && /を支えに、.+を育てている/.test(tSodate), '⑥：そだてちゅうのカードが現れ、レベル＝段（4つのうち3つ目）と副題が付く');
  await page.goto(`${BASE}#/card/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('.switch-card');
  const tCard2 = await mieru('カード_育てている');
  tashika(/育てているカード/.test(tCard2) && /練習の記録/.test(tCard2) && /同じくらい/.test(await zentai()), '⑥：カードの画面に、育てているスイッチと、本人の練習の記録が出る');
  tashika(!/\d+\s*枚/.test(tCard2), '⑥：カードの枚数が出ない');
  // 今日はやらない
  await page.goto(`${BASE}#/sodateru/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#yasumu');
  await page.click('#yasumu');
  const tYasumi = await mieru('育てる_今日はやらない');
  tashika(/今日は お休み/.test(tYasumi) && /また 別の日に/.test(tYasumi), '⑥：「今日はやらない」を選ぶと、練習しないで終わる');
  await page.goto(`${BASE}#/sensei/ko/${encodeURIComponent(kidId)}`);
  await page.waitForSelector('#kasetsu .kasetsu', { timeout: 60000 });
  const tRenshu = await mieru('先生の画面_練習の記録');
  tashika(/練習の記録（⑥ 育てる）/.test(tRenshu) && /育てているカード：/.test(tRenshu) && /「今日はやらない」を選んだ日：1日/.test(tRenshu) && /楽になったか/.test(tRenshu), '④(e)：先生の画面に、練習の記録（回数・段・楽になったか・やらなかった日）が出る');

  // 保存した結果を見る（デモの子：1回だけの3人と、3回分の3人）
  const KITAI = { デモ1: /聞いてスイッチ/, デモ2: /どれでもスイッチ/, デモ3: /図でスイッチ/, デモ4: /聞いてスイッチ/, デモ5: /どれでもスイッチ/, デモ6: /どれでもスイッチ/, デモ7: /聞いてスイッチ/, デモ8: /図でスイッチ/ };
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
      tashika(/持っているカード/.test(c) && (await page.locator('.switch-card').count()) === 2 && /1回目のゲーム（2026-09-09）のあとで、もらったカード/.test(await zentai()), `${id}：1回目にもらったカードが手元に残っている`);
    }
    tashika(/— (読むと聞くを比べて|文と図を比べて|一気にと区切ってを比べて|どれでも力が出た)/.test(c), `${id}：カードに、比べた2つの出し方の副題が付く`);
    tashika(/レベル：(見つけた|確かめた|しっかり)/.test(c) && /レベル：/.test(t) === false, `${id}：カードにレベルが付く（先生の画面はカードの名前とレベルの名前だけ）`);
    if (id === 'デモ4') {
      tashika(/レベル：しっかり/.test(c) && /聞いてスイッチ（しっかり）/.test(t), `${id}：3日で同じ向きのカードは、いちばん上のレベル`);
      tashika(KITAI[id].test(c) && /別々の日にした3日分のゲームのすべてで、くり返し/.test(await zentai()), `${id}：くり返し出た候補のカードで、回の数が事実で書いてある`);
      tashika(/くり返し出た候補「聞く」/.test(t), `${id}：先生の画面に「くり返し出た候補」が出る`);
    } else {
      tashika(KITAI[id].test(c) && /この日のゲームでは/.test(await zentai()) && /力が 出せ(るかも|そう|る)/.test(c), `${id}：カードが結果に合い、「この日の」結果だと分かる`);
      tashika(!/くり返し出た候補「/.test(t), `${id}：くり返し出た候補にならない`);
    }
    await page.goto(`${BASE}#/tsutae/${encodeURIComponent(id)}`);
    await page.waitForSelector('#kondan', { timeout: 60000 });
    const tT = await mieru(`デモ_${id}_伝え方`);
    tashika(!/保護者向け説明（(きいて|よんで|ずで|ぶんで|くぎって|いっきに)スイッチ）/.test(tT), `${id}：伝え方の見出しは今のカードの名前（保存した文の本文は前の名前のまま）`);
    if (id === 'デモ1') tashika(/HR の冒頭で先生が話すこと/.test(tT) && /今は答えない/.test(tT), '⑤：HR の冒頭で先生が話すことの下書きが出る');
    if (id === 'デモ7') {
      tashika(!/どれでもスイッチ/.test(c) && !/どれでもスイッチ/.test(t), 'デモ7：一人前になった日に「どれでも」を出さない（8便 K4）');
      tashika(/育てているカード/.test(c) && /読んでスイッチ/.test(c) && /レベル：一人前/.test(c) && /●●●●/.test(c) && /聞くを支えに、読むを育てた/.test(c) && /練習の記録/.test(c), 'デモ7：練習で育ったカードが一人前で出て、本人の練習の記録がある');
      tashika(/練習の記録（⑥ 育てる）/.test(t) && /「今日はやらない」を選んだ日：1日/.test(t) && /前の回との違い/.test(t), 'デモ7：先生の画面に、練習の記録と前の回との違いが出る');
      await page.goto(`${BASE}#/sodateru/${encodeURIComponent(id)}`);
      await page.waitForSelector('#riyuu');
      const tS = await mieru('デモ7_育てる');
      tashika(/読むだけ/.test(tS) && !(await vis('#hajimeru')), 'デモ7：⑥ 育てるは、段4（読むだけ）で、架空の子なので練習は始めない');
    }
    if (id === 'デモ8') tashika(/比べた問題：要素の少ない場面/.test(t) && /比べた問題：短い文/.test(t), 'デモ8：先生の画面に、やさしい段階で比べたことが事実で出る（子どもの画面には出ない）');
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
  await page.waitForSelector('#riyuu');
  const rO = await susumu(99);
  tashika(rO === 'owari', 'Should：大人もゲームを最後まで通せる');
  await page.click('a[href^="#/card/"]');
  await page.waitForSelector('.switch-card');
  const tO = await mieru('カード_大人');
  const tOZen = await zentai();
  tashika(/まわりにお願いしてよいこと/.test(tOZen) && !/先生にお願いしてよいこと/.test(tOZen), 'Should：大人のカードは「まわりにお願いしてよいこと」');
  tashika(tOZen.includes(seihon()['相談先の案内（大人が試すとき・結果に関係なく同じ文）']) && !tOZen.includes('担任'), '大人の画面の相談先は、大人用の決まった文');

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
  await page.waitForSelector('.annai-ichibun');
  tashika(!/\d+\s*分/.test(await mieru('子どもの案内_設定を変えたあと')), '子ども向けの案内には、時間を言い切る文が無い');
  await page.goto(`${BASE}#/check`);
  await page.waitForSelector('.chip');
  tashika((await page.locator('.chip[data-kid^="大人"]').count()) === 0, 'Should：大人の記録は、クラスのチェック項目に出ない');

  // 10便 M2：Claude が書いた文を端末に覚える。開き直しでは呼ばない／押したら呼び直す／記録・設定が変わったら呼び直す／予備の文は覚えない
  // 鍵は使わない。サーバーの予備の返事を、通し確認の中だけ「Claude が書いた」ことにして数える（外へは何も送らない）
  {
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => kiroku.まちがい.push(String(e)));
    const kazu = { kasetsu: 0, tsutae: 0, keikaku: 0 };
    let claudeNiSuru = true;
    for (const name of Object.keys(kazu)) {
      await p2.route(`**/api/${name}`, async (route) => {
        kazu[name]++;
        const res = await route.fetch();
        const j = await res.json();
        if (claudeNiSuru) { j.dare = 'claude'; delete j.wake; }
        await route.fulfill({ json: j });
      });
    }
    const hiraku = async (hash, sel) => { await p2.goto(`${BASE}${hash}`); await p2.waitForSelector(sel, { timeout: 60000 }); await p2.waitForTimeout(150); return p2.evaluate(() => document.body.innerText); };
    const HOZON = /2026-11-04 に書いた下書き（保存したもの）/;
    const hozon = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo_claude.json'), 'utf8')).文;
    // 11便 N2・N5：デモの子8人は、開いただけでは呼ばない（保存した本物の文と、その印が出る）
    let zenbu = true;
    for (const id of ['デモ1', 'デモ2', 'デモ3', 'デモ4', 'デモ5', 'デモ6', 'デモ7', 'デモ8']) {
      const e = encodeURIComponent(id);
      const a = await hiraku(`#/sensei/ko/${e}`, '#kasetsu .kasetsu');
      const b = await hiraku(`#/tsutae/${e}`, '#kondan');
      const kondan = await p2.inputValue('#kondan');
      if (!(HOZON.test(a) && a.includes(hozon[id].kasetsu.kasetsu) && HOZON.test(b) && kondan === hozon[id].tsutae.kondan)) { zenbu = false; kiroku.まちがい.push(`${id}：保存した文が出ていない`); }
    }
    tashika(zenbu && kazu.kasetsu === 0 && kazu.tsutae === 0, `N5：デモの子8人の先生の画面と伝え方は、保存した本物の文と「保存したもの」の印が出て、開いただけでは呼ばない（仮説 ${kazu.kasetsu}回・伝え方 ${kazu.tsutae}回）`);
    let t = await hiraku('#/sensei', '#keikaku .label');
    tashika(kazu.keikaku === 0 && HOZON.test(t) && t.includes(hozon.__クラス__.keikaku.zentai), `N5：一覧の計画も、デモの子8人だけなら保存した文が出て、呼ばない（${kazu.keikaku}回）`);
    // 押したときだけ呼び、呼んだ文は端末に覚える（保存した文は書きかえない）
    const D1 = encodeURIComponent('デモ1');
    await hiraku(`#/sensei/ko/${D1}`, '#kasetsu .kasetsu');
    await p2.click('#kasetsu #again');
    await p2.waitForSelector('#kasetsu .kasetsu');
    t = await p2.evaluate(() => document.body.innerText);
    tashika(kazu.kasetsu === 1 && /この文は端末に覚えています/.test(t) && /\d+月\d+日に書いた/.test(t), 'N5・M2：「もう一度書いてもらう」を押すと呼び、書いた日と「端末に覚えています」が出る');
    await hiraku('#/anzen', 'h1');
    t = await hiraku(`#/sensei/ko/${D1}`, '#kasetsu .kasetsu');
    tashika(kazu.kasetsu === 1 && /この文は端末に覚えています/.test(t), `M2：開き直すと、端末に覚えた文が出て、呼ばない（仮説 ${kazu.kasetsu}回）`);
    tashika(JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo_claude.json'), 'utf8')).文.デモ1.kasetsu.kasetsu === hozon.デモ1.kasetsu.kasetsu, 'N2：保存した文のファイルは書きかわらない');
    // チェック項目が変わったら、保存した文は使わず、呼び直す
    await p2.goto(`${BASE}#/check`);
    await p2.waitForSelector('.chip');
    await p2.locator('.chip[data-kid="デモ1"]').first().click();
    await p2.waitForTimeout(150);
    await hiraku(`#/sensei/ko/${D1}`, '#kasetsu .kasetsu');
    tashika(kazu.kasetsu === 2, 'M2：チェック項目が変わったら、呼び直す');
    // 計画：学校の設定が変わったら呼び直す／押したら呼び直す
    await hiraku('#/sensei', '#keikaku .label');
    tashika(kazu.keikaku === 0, '計画：まだ呼んでいない');
    await p2.selectOption('select[data-k="朝の練習の長さ"]', '15');
    await p2.waitForTimeout(400);
    tashika(kazu.keikaku === 1, 'M2・N2：学校の設定が変わったら、保存した計画は使わず、呼び直す');
    await p2.click('#keikaku-again');
    await p2.waitForTimeout(400);
    tashika(kazu.keikaku === 2, 'M2：計画の「もう一度書いてもらう」で呼び直す');
    // 予備の文は覚えない
    claudeNiSuru = false;
    const y0 = kazu.kasetsu;
    t = await hiraku(`#/sensei/ko/${D1}`, '#kasetsu .kasetsu'); // 学校の設定を変えたので、覚えた文の目印も変わる
    tashika(kazu.kasetsu === y0 + 1 && !/この文は端末に覚えています/.test(t), 'M2：学校の設定が変わったら、仮説も呼び直す（いまは予備の文が返り、覚えない）');
    const D2 = encodeURIComponent('デモ2');
    await hiraku(`#/sensei/ko/${D2}`, '#kasetsu .kasetsu');
    await p2.click('#kasetsu #again'); // 予備の文が返る
    await p2.waitForTimeout(300);
    const y1 = kazu.kasetsu;
    await hiraku('#/anzen', 'h1');
    t = await hiraku(`#/sensei/ko/${D2}`, '#kasetsu .kasetsu');
    tashika(kazu.kasetsu === y1 && HOZON.test(t) && !/この文は端末に覚えています/.test(t), 'M2・N2：予備の文は覚えない（開き直すと、また保存した本物の文が出る）');
    await ctx2.close();
  }

  // 12便 P4（Should）：⑥ の「図を触る」。架空のデモの子2（どれでも）の記録を、この端末で動かした子として入れ、「文だけで場面をつかむ」を選ぶ
  {
    const ctx3 = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => kiroku.まちがい.push(String(e)));
    const d2 = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo.json'), 'utf8')).結果.デモ2;
    const ID = 'その場90';
    await p3.goto(`${BASE}#/`);
    await p3.evaluate(([id, kai]) => {
      localStorage.setItem('chikara-no-switch.v3', JSON.stringify({ kids: { [id]: { id, kai: kai.map((r, i) => ({ ...r, id, kai: i + 1, owari: true })) } }, check: null, ai: {}, seq: 90 }));
    }, [ID, d2.kai]);
    await p3.goto(`${BASE}#/sodateru/${encodeURIComponent(ID)}`);
    await p3.waitForSelector('.choice');
    await p3.locator('.choice', { hasText: '文だけで場面をつかむ' }).click();
    await p3.waitForSelector('#hajimeru');
    await p3.click('#hajimeru');
    await p3.waitForSelector('.sawaru-zu');
    const pool = JSON.parse(readFileSync(path.join(ROOT, 'public/data/renshu.json'), 'utf8'));
    const dai = (await p3.locator('.bamen-dai').innerText()).trim();
    const item = pool.B.問題.find((x) => x.題 === dai && x.段階 === 2) || pool.B.問題.find((x) => x.題 === dai);
    const rows = item.図.type === 'seki' ? item.図.retsu : item.図.tana;
    const kotae = [];
    rows.forEach((r, i) => r.forEach((n, j) => { if (n != null) kotae.push([`${i}-${j}`, n]); }));
    // 1つ目は、わざと別の枠に置いてから「もどす」（直した回数 1）
    const [k0, n0] = kotae[0];
    const [k1] = kotae[1];
    await p3.click(`.fuda[data-f="${n0}"]`);
    await p3.click(`.sawaru-masu[data-k="${k1}"]`);
    await p3.click('#modosu');
    for (const [k, n] of kotae) { await p3.click(`.fuda[data-f="${n}"]`); await p3.click(`.sawaru-masu[data-k="${k}"]`); }
    const tSawaru = await p3.evaluate(() => document.body.innerText);
    await p3.screenshot({ path: path.join(OUT, 'P4_図を触る.png'), fullPage: true });
    const over3 = await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over3 > 0) kiroku.はみ出し.push({ 画面: 'P4_図を触る', はみ出し: over3 });
    tashika((await p3.isEnabled('#dekita')) && /置いてみよう/.test(tSawaru) && !/(?<!階)段(?!目)/.test(tSawaru), `P4：札をタップで図に置ける・「もどす」がある・全部置くと「できた」を押せる（${dai}）`);
    await p3.click('#dekita');
    await p3.waitForSelector('.choice');
    // 1つ目のひとつの問いに答える（次のひとつが出たら止める）
    for (let i = 0; i < 10; i++) {
      if (await p3.locator('.sawaru-zu, #tsugi').first().isVisible().catch(() => false)) break;
      if (await p3.locator('.choice').first().isVisible().catch(() => false)) { await p3.locator('.choice').first().click(); await p3.waitForTimeout(150); continue; }
      await p3.waitForTimeout(150);
    }
    if (await p3.locator('#tsugi').isVisible().catch(() => false)) await p3.click('#tsugi');
    await p3.click('#tomeru');
    await p3.waitForSelector('.choice');
    await p3.locator('.choice', { hasText: '同じくらい' }).click();
    await p3.waitForSelector('.switch-card');
    await p3.goto(`${BASE}#/sensei/ko/${encodeURIComponent(ID)}`);
    await p3.waitForSelector('#kasetsu');
    const tS = await p3.evaluate(() => document.body.innerText);
    tashika(/図を触る 1回（直した回数 1）/.test(tS), 'P4：先生の画面の練習の記録に、図を触った回数と直した回数が事実で出る');
    await ctx3.close();
  }

  // 13便のもと（実機で見つかった所）：棚 B の問題は、図（または文）・問い・選択肢が1画面に収まる（学校のノートPC・iPad・小さいスマホ）
  {
    const B = JSON.parse(readFileSync(path.join(ROOT, 'public/data/tana.json'), 'utf8')).B.問題;
    for (const [mei, w, h, touch] of [['学校のノートPC', 1366, 657, false], ['iPad 縦', 768, 1024, true], ['小さいスマホ', 375, 667, true]]) {
      const ctx4 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
      const p4 = await ctx4.newPage();
      const dame = [];
      for (const id of Object.keys(B)) for (const mode of ['zu', 'bun']) for (let i = 0; i < B[id].問い.length; i++) {
        await p4.goto(`${BASE}#/mikurabe/${encodeURIComponent(id)}/${mode}/${i}`);
        await p4.waitForSelector('.bamen-wrap .choice');
        const sita = await p4.evaluate(() => Math.max(...[...document.querySelectorAll('.bamen-wrap .choice')].map((x) => x.getBoundingClientRect().bottom + window.scrollY)));
        if (sita > h) dame.push(`${id}${mode}${i + 1}`);
      }
      tashika(!dame.length, `棚 B の問題が1画面に収まる（${mei} ${w}×${h}）${dame.length ? '：' + dame.join(' ') : ''}`);
      await ctx4.close();
    }
  }

  // PC の幅（1280px）でも、先生の画面・チェック項目・伝え方が崩れない
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}#/mikurabe`);
  await page.waitForSelector('.mikurabe');
  const tMi = await mieru('PC_文と図を見比べる');
  tashika((await page.locator('.mikurabe').count()) === 8 && (await page.locator('.mikurabe .bamen-zu').count()) === 8 && /文の版/.test(tMi) && /図の版/.test(tMi), '先生の画面：棚 B の8題の、文の版と図の版を並べて見比べられる');
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

// 12便 P2 (11)：子どもの画面の固定文の字数（画面の種類ごとに、いちばん多かった画面）
{
  const shurui = {};
  for (const [name, j] of Object.entries(kiroku.字数)) {
    const k = name.replace(/_\d+$/, '').replace(/^デモ_デモ\d_/, 'デモ_').replace(/^PC_/, '');
    if (!shurui[k] || shurui[k].kotei < j.kotei) shurui[k] = j;
  }
  writeFileSync(path.join(OUT, '字数.json'), `${JSON.stringify(shurui, null, 1)}\n`);
  console.log('\n=== 子どもの画面の固定文の字数（画面の種類ごとの最大・上限 60字／つなぎ・理由 20字） ===');
  for (const [k, j] of Object.entries(shurui)) console.log(`${k}：${j.kotei}字${j.ichibun ? `（つなぎ・理由 ${j.ichibun}字）` : ''}`);
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
