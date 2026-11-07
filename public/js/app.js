// 画面の切りかえと、①案内・③カード・④先生の画面・⑤伝え方（②見つける＝game.js、⑥育てる＝sodateru.js）
import { esc, api, data, okuruKiroku, whoLabel, MICHI } from './util.js';
import { getRecord, getKid, owattaKai, newKai, isDemo, namaeOf, isOtona, isTaiken, newTaiken, newKid, localKids, classList, checkMarks, toggleMark, atehamaruIds, claudeNoOboe, claudeWoOboeru, motoNoKey, demo, hiduke } from './kiroku.js';
import { hikitsugiNoBun } from './hikitsugi.js';
import { setteiWoIreru, matome, matomeKai, maeTonoChigai, erabuCardKai, motteiruCards, cardNoBun, cardNoFukudai, levelNoNamae, imaNoNamae, LEVEL_JOUGEN, kotaeD, DASHIKATA, TANA_MEI, mieruKoumoku } from './kurabe.js';
import { gameScreen, setSettei, bamenNoGamen, gameWoHanareru } from './game.js';
import { junbiYomiage, yomu, tomeru, yomeru } from './yomiage.js';
import { cardHtml } from './card_html.js';
import { bamenZu } from './zu.js';
import { gakkoSettei, gakkoWoKaeru, soudanNoBun, keikakuNoSettei } from './gakko.js';
import { keikakuNoKo, yobiKeikaku } from './keikaku.js';
import { sodateruGamen, renshuKirokuHtml } from './sodateru_gamen.js';
import { sodateCards, sodateCardNoBun, ichininmaeOf, jibunDeErabu, DAN_JOUGEN, SODATE_MEI } from './sodateru.js';

export const SOUDAN_OTONA_UTSUSHI = '気になることや困っていることがあれば、かかりつけの医師や、お住まいの市区町村の相談窓口に相談できます。このゲームの結果があってもなくても、相談はできます。';
export const SOUDAN_KO_UTSUSHI = '困ったときは、担任の先生か{相談先}に話してね。結果とは関係ないよ。';
export const SOUDAN_UTSUSHI = '気になることや困っていることがあれば、いつでも担任の先生や、{相談先}に話してください。このゲームの結果があってもなくても、相談はできます。';
const app = document.getElementById('app');
let should = {};
let joutai = { ai: false, soudan: '', soudanKo: '', soudanOtona: '' };

// 道すじ（ナビ）。12便 P1：子どもの画面では「いま：②」の1語だけ（④⑤ は出さない）。先生・保護者の画面は7つを並べる
let michiNoIma = null;
function michiWoKaku() {
  const nav = document.getElementById('michi');
  const ima = michiNoIma;
  if (ima == null) { nav.innerHTML = ''; return; }
  if (kodomoNoGamen()) {
    nav.innerHTML = [3, 4].includes(ima) ? '' : `<span class="ima ichigo">いま：${esc(MICHI[ima].split(' ')[0])}</span>`;
    return;
  }
  nav.innerHTML = MICHI.map((m, i) => `<span class="${i === ima ? 'ima' : ''}">${esc(m)}</span>`).join('');
}
function michi(ima) {
  michiNoIma = ima;
  michiWoKaku();
}
function kodomoNoGamen() {
  return /子どもの画面|大人が試す画面/.test(document.body.dataset.gamen || '');
}
function dare(t) {
  document.getElementById('dare').textContent = t || '';
  document.body.dataset.gamen = t || '';
  michiWoKaku();
}

// 12便 P1：右上の読み上げ ▶。比べる対象ではない文（つぎの一文・質問・案内・カード・練習）を読む。
// 測っている問題のあいだ（body[data-hakaru]）は、本文や問いを読まず、「次は 〇〇」の一文だけを読む（比べがこわれないように）
function yomuMojiretsu() {
  if (document.body.dataset.hakaru === '1') return document.getElementById('riyuu')?.textContent || '';
  const el = [...app.querySelectorAll('h1, h2, h3, p, li, .toi, .honbun, .choice, .mei, .fukudai, .hitokoto')]
    .filter((x) => x.offsetParent !== null && !x.closest('details:not([open])') && !x.closest('.muted'));
  return el.map((x) => x.textContent.trim()).filter(Boolean).join('。');
}
// 相談先：子ども・保護者には全員に同じ文。大人が自分で試す画面には、大人用の決まった文（どちらも結果に関係なく同じ）
// 12便：子どもの画面は短い文（kind 'ko'）。これも結果に関係なく、全員に同じ文
// 相談先の呼び名（学校の設定）。画面を開くたびに読み直す
let yobina = { 相談先の呼び名: 'カウンセラーの先生' };
function soudanHtml(otona = false, kind = '') {
  if (kind === 'ko') return `<div class="box soudan"><p>${esc(soudanNoBun(joutai.soudanKo || SOUDAN_KO_UTSUSHI, yobina))}</p></div>`;
  return `<div class="box soudan"><h3>相談したいとき</h3><p>${esc(otona ? joutai.soudanOtona || SOUDAN_OTONA_UTSUSHI : soudanNoBun(joutai.soudan || SOUDAN_UTSUSHI, yobina))}</p></div>`;
}
const enc = encodeURIComponent;

// ---- はじめの画面
async function top() {
  michi(null);
  dare('');
  const mada = localKids().filter((k) => !k.owari);
  app.innerHTML = `
    <h1>チカラのスイッチ</h1>
    <p>同じ問題を、出し方（読む・聞く・図で見る・一文ずつ区切る）だけ変えて解いてみて、どの出し方のとき力が出たかを、本人の結果で確かめるアプリです。力が出た出し方は「スイッチカード」として残ります。</p>
    <div class="entrance">
      <a href="#/hajimeru/taiken"><div class="box"><strong>短い体験（審査員の方へ）</strong><br><span class="muted">数分で、ゲームから先生の画面までを通して見られます。結果は本物の測定ではありません。</span></div></a>
      <a href="#/sensei"><div class="box"><strong>保存した結果を見る</strong><br><span class="muted">架空の子の結果を、先生の画面で見ます。1回だけの子（出し方で違いが出た子・どの出し方でも同じくらいだった子）と、3回分の記録がある子がいます。</span></div></a>
      <a href="#/annai/ko"><div class="box"><strong>その場で動かす</strong><br><span class="muted">①案内 → ②見つける（HR のゲーム）→ ③カード → ④先生の画面 → ⑤伝え方 → ⑥育てる（朝の練習）→ ⑦また見つける、を順に動かします。公開デモでは、AI を呼べる回数に上限があります。上限に達したときは、決まった順・決まった文で最後まで動きます。</span></div></a>
      ${should.otona?.使う ? '<a href="#/annai/otona"><div class="box"><strong>大人が自分で試す</strong><br><span class="muted">中学生向けのゲームを、大人の方も自分で試せます。結果は自分にだけ出ます。</span></div></a>' : ''}
    </div>
    ${mada.length ? `<div class="box soft"><h3>ひと休み中のゲーム</h3>${mada.map((k) => `<p><a href="#/game/${enc(k.id)}">${esc(k.id)} の続きから始める</a></p>`).join('')}</div>` : ''}
    <h2>案内</h2>
    <p><a href="#/annai/ko">子ども向けの案内</a>　<a href="#/annai/hogo">保護者向けの案内</a></p>`;
}

// ---- ① 案内
async function annai(who) {
  michi(0);
  const a = (await data('annai'))[who === 'ko' ? '子ども' : who === 'otona' ? '大人' : '保護者'];
  dare(who === 'ko' ? '子どもの画面' : who === 'otona' ? '大人が試す画面' : '保護者の画面');
  if (who === 'ko' && a.画面) { annaiKo(a.画面); return; }
  const settei = await gakkoSettei();
  const tani = (await data('gakko')).単位;
  app.innerHTML = `
    <h1>${esc(a.題)}</h1>
    ${a.段.map((d) => `<h2>${esc(d.見出し)}</h2><p>${esc(setteiWoIreru(d.文, settei, tani))}</p>`).join('')}
    ${soudanHtml(who === 'otona')}
    <div class="btns">
      ${who === 'otona'
        ? '<a class="btn" href="#/hajimeru/otona">試してみる</a><a class="btn sub" href="#/">はじめの画面へ</a>'
        : '<a class="btn" href="#/annai/ko">子ども向けの案内へ</a>'}
    </div>`;
}

// 12便 P2：子ども向けの案内は、一画面一文（「つぎへ」で進む）。相談先は、どの画面にも同じ短い文
// 相談先は、最後の1画面にする（どの子も「はじめる」の前に必ず通る。結果に関係なく、全員に同じ短い文）
function annaiKo(gamen, i = 0) {
  const zen = gamen.length + 1;
  const saigo = i === gamen.length;
  const g = saigo ? null : gamen[i];
  app.innerHTML = `
    <p class="annai-kazu">${i + 1}／${zen}</p>
    ${saigo ? `<div class="annai-ichibun soudan-ko">${soudanHtml(false, 'ko')}</div>` : `<p class="annai-ichibun">${esc(g.文)}</p>`}
    ${g?.e ? `<div class="annai-e">${g.e.map(([e, t]) => `<span><span class="e" aria-hidden="true">${e}</span>${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="btns">${saigo ? '<a class="btn" href="#/hajimeru">始める</a>' : '<button id="annai-tsugi">次へ</button>'}</div>
    <p class="small"><a href="#/annai/hogo">保護者の方へ</a></p>`;
  const b = document.getElementById('annai-tsugi');
  if (b) b.onclick = () => { tomeru(); annaiKo(gamen, i + 1); window.scrollTo(0, 0); };
}

async function hajimeru(dare_) {
  // 36便：短い体験（6つの問題だけ・Claude を呼ばない）
  if (dare_ === 'taiken') { location.replace(`#/game/${enc(newTaiken())}`); return; }
  const id = newKid(dare_ === 'otona' ? '大人' : 'その場');
  location.replace(`#/game/${enc(id)}`);
}

// ---- ③ スイッチカード
async function card(id) {
  michi(2);
  dare(isOtona(id) ? '大人が試す画面' : '子どもの画面');
  const rec = await getRecord(id);
  const kai = await owattaKai(id);
  if (!rec || !kai.length) {
    app.innerHTML = `<h1>カード</h1><p>ゲームが終わると、カードが届くよ。</p>${rec ? `<p><a class="btn" href="#/game/${enc(id)}">つづきから</a></p>` : ''}`;
    return;
  }
  const cards = await data('cards');
  const { cards: motte, atarashii, agatta } = motteiruCards(kai);
  const tsugiNoKai = !isDemo(id) && !isTaiken(id) && rec.owari;
  const hyouji = (m) => cardHtml(cardNoBun(cards.カード[m.card], m.kurikaeshi), {
    atarashii: kai.length > 1 && atarashii.includes(m.card),
    susunda: agatta.includes(m.card),
    fukudai: cardNoFukudai(cards, m),
    level: m.level,
    levelMei: levelNoNamae(cards, m),
    jougen: m.sodate ? 4 : LEVEL_JOUGEN,
    moratta: m.kai ? `${m.kai}回目のゲーム${m.hi ? `（${m.hi}）` : ''}のあとで、もらったカード` : '',
    otona: isOtona(id),
  });
  const [mae, ...ushiro] = motte;
  const kid = await getKid(id);
  const renshu = kid?.renshu || [];
  const sodate = sodateCards(renshu, ichininmaeOf(kai, renshu));
  const sodateHyouji = (m) => cardHtml(sodateCardNoBun(cards, m), { fukudai: cardNoFukudai(cards, m), level: m.level, levelMei: levelNoNamae(cards, m), jougen: DAN_JOUGEN, otona: isOtona(id), sodate: true });
  // 12便 P2：子どもの画面の固定文を減らす。主ボタンは「⑥ 朝の練習へ」の1つだけ。練習の記録・相談先・⑦ の説明は折りたたむ
  app.innerHTML = `
    <h1>あなたのカード</h1>
    ${hyouji(mae)}
    ${ushiro.length ? `<h2>持っているカード</h2>${ushiro.map(hyouji).join('')}` : ''}
    ${sodate.length ? `<h2>育てているカード</h2>${sodate.map(sodateHyouji).join('')}` : ''}
    ${rec.owari ? '' : `<div class="box soft"><a class="btn sub" href="#/game/${enc(id)}">つづきから</a></div>`}
    ${isTaiken(id) ? `<div class="btns"><a class="btn" href="#/sensei/ko/${enc(id)}">先生が見る画面へ</a></div>` : `<div class="btns"><a class="btn" href="#/sodateru/${enc(id)}">⑥ 朝の練習へ</a></div>`}
    ${tsugiNoKai ? `<details class="box soft" id="mata-waku"><summary>⑦ また見つける</summary><p>別の日に、短いゲーム（10分ほど）を もう一度します。前のゲームと あわせて 比べます。もらったカードは、なくならないよ。</p><button class="sub" id="tsugi-kai">はじめる</button></details>` : ''}
    ${renshu.length ? `<details class="box"><summary>練習の記録</summary><p class="muted small">あなたの記録です。この端末の中にだけ残します。</p>${renshuKirokuHtml(renshu)}</details>` : ''}
    <details class="box soudan"><summary>困ったとき</summary>${isOtona(id) ? soudanHtml(true) : soudanHtml(false, 'ko')}</details>
    ${isTaiken(id) ? '' : `<p class="small"><a href="#/sensei/ko/${enc(id)}">${isOtona(id) ? 'くわしい結果（先生の画面と同じもの）' : '先生が見る画面へ'}</a></p>`}`;
  const b = document.getElementById('tsugi-kai');
  if (b) b.onclick = () => { if (newKai(id, 'mijikai')) location.hash = `#/game/${enc(id)}`; };
}

// ④(e) 練習の記録：回数・段・楽になったか。本人が選んだ出し方は「本人の好み」と書く（候補ではない）
function renshuSenseiHtml(renshu, kai, cards) {
  if (!renshu.length) return '<p class="muted">まだ練習していません。</p>';
  const sc = sodateCards(renshu, ichininmaeOf(kai, renshu));
  const jibun = jibunDeErabu(renshu);
  const yasumi = renshu.filter((r) => r.yasumi).length;
  const hi = new Set(renshu.filter((r) => !r.yasumi && (r.hitotsu || []).length).map((r) => r.hi)).size;
  return `
    <p>育てているカード：${sc.map((m) => `<strong>${esc(cards.カード[m.card].名前)}</strong>（${esc(levelNoNamae(cards, m))}・レベル ${m.level}／${DAN_JOUGEN}${m.kara === 'hr' ? '・また見つけるのゲームで差が出なかった' : ''}）`).join('・')}</p>
    <p class="small">練習した日：${hi}日${yasumi ? `・「今日はやらない」を選んだ日：${yasumi}日` : ''}</p>
    ${jibun ? `<p class="small">出し方の差が見つからなかったので、本人が「${esc(SODATE_MEI[jibun])}」を選んで練習しています（本人の好み。候補ではありません）。</p>` : ''}
    ${renshuKirokuHtml(renshu, { sensei: true })}
    <p class="muted small">段が進むのは、同じ段で「正解が多い（3分の2以上）」ひとつが2回続いたときだけです（下がりません）。練習の記録は本人のものです。練習の効果（学力への）は確かめていません。</p>`;
}

// 11便 N2：デモの子の、保存した Claude の本物の文（public/data/demo_claude.json）。
// 端末に覚えた文が無く、元になるもの（チェック項目・学校の設定）がはじめのままのときだけ使い、Claude を呼ばない
async function hozonNoBun(id, kind) {
  if (!isDemo(id) && id !== '__クラス__') return null;
  let h;
  try { h = await data('demo_claude'); } catch { return null; }
  const v = h?.文?.[id]?.[kind];
  return v ? { ...v, hozon: h.印 } : null;
}
async function hajimeNoChecks(id) {
  const m = structuredClone((await demo()).チェック項目);
  return Object.entries(m).filter(([, kids]) => kids.includes(id)).map(([k]) => k).sort();
}
async function hajimeNoSettei(settei) {
  const g = (await data('gakko')).設定;
  return Object.keys(keikakuNoSettei(g)).every((k) => g[k] === settei[k]);
}

// 37便：短い体験の「見本」。架空の子（デモ1）について Claude が書いて保存した文を、見本だと分かる形で出す（Claude は呼ばない）
const MIHON_NO_KO = 'デモ1';
async function mihonNoKasetsu() {
  const h = await hozonNoBun(MIHON_NO_KO, 'kasetsu');
  const mei = await namaeOf(MIHON_NO_KO);
  const tsugi = '<p>短い体験では、Claude は呼びません。本番のゲームが終わると、Claude がこの子の仮説の下書きを書きます。</p>';
  if (!h) return tsugi;
  return `${tsugi}
    <div class="box soft"><p><span class="label">見本</span>架空の子（${esc(mei)}）について、Claude が書いて保存した仮説です。この体験の結果ではありません。</p>
      <p><span class="label">仮説</span><span class="kasetsu">${esc(h.kasetsu)}</span></p>
      <p>${esc(h.tsugi)}</p>
      <p class="small">${esc(h.sankou || '参考程度・決めるのは先生')}。</p></div>
    <div class="btns"><a class="btn sub" href="#/sensei/ko/${enc(MIHON_NO_KO)}">保存した結果（架空の子）を見る</a></div>`;
}
async function mihonNoTsutae() {
  const h = await hozonNoBun(MIHON_NO_KO, 'tsutae');
  const mei = await namaeOf(MIHON_NO_KO);
  const tsugi = '<p>短い体験では、Claude は呼びません。本番のゲームが終わると、Claude がこの子の伝え方の下書きを書きます。</p>';
  if (!h) return tsugi;
  return `${tsugi}
    <div class="box soft"><p><span class="label">見本</span>架空の子（${esc(mei)}）について、Claude が書いて保存した懇談の下書きです。この体験の結果ではありません。</p>
      <p>${esc(h.kondan)}</p></div>
    <div class="btns"><a class="btn sub" href="#/tsutae/${enc(MIHON_NO_KO)}">保存した伝え方の下書き（架空の子）を見る</a></div>`;
}

// Claude の文を端末に覚えていることの表示。決まった文には出さない。保存した文には、保存の印を出す
function oboeHtml(k) {
  if (k?.hozon) return `<p class="muted small oboe">${esc(k.hozon)}。架空の子の文として保存してあるので、開いても Claude は使いません。「もう一度書いてもらう」で書き直します（書き直した文は、この端末に残します）。</p>`;
  if (!k || k.dare !== 'claude') return '';
  const hi = String(k.kaitaHi || '').split('-');
  const hizuke = hi.length === 3 ? `${Number(hi[1])}月${Number(hi[2])}日に書いた` : '';
  return `<p class="muted small oboe">Claude（AI）が書いた下書き${hizuke ? `・${hizuke}` : ''}。この文は、この端末に残しています。「もう一度書いてもらう」で書き直します。</p>`;
}

// ---- ④ 先生の画面（子の一覧）
async function senseiHub() {
  michi(3);
  dare('先生の画面');
  const d = await demo();
  const local = localKids();
  app.innerHTML = `
    <h1>先生の画面</h1>
    <p>結果は、その子の中で出し方ごとに比べたものです。他の子とは比べません。</p>
    <h2>保存した結果（架空の子）</h2>
    <p class="muted small">名前も結果も、すべて架空です。実在の子のデータではありません。</p>
    ${Object.keys(d.結果).map((id) => `<p><a href="#/sensei/ko/${enc(id)}">${esc(d.クラス.find((k) => k.id === id).呼び名)}</a></p>`).join('')}
    <h2>この端末で動かした子</h2>
    ${local.length ? local.map((k) => `<p><a href="#/sensei/ko/${enc(k.id)}">${esc(k.id)}</a>（${k.kaisu}回${k.owari ? '' : '・ゲームの途中'}）</p>`).join('') : '<p class="muted">まだありません。</p>'}
    <h2>チェック項目</h2>
    <p><a href="#/check">クラスで「当てはまる子」を選ぶ</a></p>
    <h2>問題を確かめる</h2>
    <p><a href="#/mikurabe">「文で見る／図で見る」の問題を、文の版と図の版で見比べる</a></p>
    <h2 class="kugiri-midashi">学校の設定</h2>
    <p class="muted small">学校ごとに変えられます。変えた値は、この端末の中にだけ残ります。</p>
    <div id="settei"></div>
    <h2 class="kugiri-midashi">期間の計画（次の「また見つける」まで）</h2>
    <div id="keikaku" aria-live="polite">計画の下書きを書いています…</div>`;
  await setteiWoKaku();
  await keikakuWoKaku();
}

async function setteiWoKaku() {
  const g = await data('gakko');
  const ima = await gakkoSettei();
  const box = document.getElementById('settei');
  box.innerHTML = `<div class="settei">${Object.keys(g.選べるもの).filter((k) => g.選べるもの[k].length > 1).map((k) => `
    <label>${esc(k)}<select data-k="${esc(k)}">${g.選べるもの[k].map((v) => `<option value="${esc(v)}" ${v === ima[k] ? 'selected' : ''}>${esc(v)}${esc(g.単位[k] || '')}</option>`).join('')}</select></label>`).join('')}</div>`;
  box.querySelectorAll('select').forEach((sel) => {
    sel.onchange = async () => {
      const k = sel.dataset.k;
      const v = typeof g.設定[k] === 'number' ? Number(sel.value) : sel.value;
      await gakkoWoKaeru(k, v);
      yobina = await gakkoSettei();
      if (k === '相談先の呼び名') return; // 呼び名は計画に使わない（Claude を呼び直さない）
      await keikakuWoKaku();
    };
  });
}

// 計画に使う子：架空の子と、この端末で動かした子（大人は入れない）。Claude には「子1」などの仮の番号だけを送る
async function keikakuWoKaku() {
  const box = document.getElementById('keikaku');
  if (!box) return;
  const settei = keikakuNoSettei(await gakkoSettei());
  const list = (await classList()).filter((k) => !isOtona(k.id));
  const kodomo = [];
  const yobina = {};
  for (const [i, k] of list.entries()) {
    const kid = await getKid(k.id);
    if (!kid) continue;
    const label = `子${i + 1}`;
    yobina[label] = k.呼び名;
    kodomo.push(keikakuNoKo(label, kid.kai, kid.renshu));
  }
  // 10便 M2：計画も端末に覚える。元になるもの（学校の設定・クラスの子の記録）が変わったときだけ呼び直す
  const key = motoNoKey({ settei, hoka: kodomo });
  const kaku = (r) => {
    box.innerHTML = `
    <p>${whoLabel(r.dare)}<span class="label sankou">${esc(r.sankou)}</span></p>
    ${r.wake ? `<p class="muted small">${esc(r.wake)}</p>` : ''}
    <p>${esc(r.zentai)}</p>
    <ul>${r.ko.map((x) => `<li><strong>${esc(yobina[x.label] || x.label)}</strong>：${esc(x.bun)}</li>`).join('')}</ul>
    ${oboeHtml(r)}
    <p class="muted small">Claude に送ったのは、仮の番号（子1・子2…）と、したこと（HR のゲーム・また見つけるの回数）・カード・練習の段・練習した日の数・学校の設定だけです。計画は下書きです。決めるのは先生です。</p>
    <div class="btns"><button class="sub" id="keikaku-again">もう一度書いてもらう</button></div>`;
    box.querySelector('#keikaku-again').onclick = () => yobidasu(true);
  };
  const yobidasu = async (force) => {
    const cached = !force && claudeNoOboe('__クラス__', 'keikaku', key);
    if (cached) { kaku(cached); return; }
    // 11便：クラスがデモの子8人だけで、学校の設定がはじめのままなら、保存した本物の計画を出す（呼ばない）
    if (!force && list.length && list.every((k) => isDemo(k.id)) && (await hajimeNoSettei(settei))) {
      const h = await hozonNoBun('__クラス__', 'keikaku');
      if (h && h.ko.length === kodomo.length) { kaku(h); return; }
    }
    box.textContent = '計画の下書きを書いています…';
    let r;
    try { r = await api('keikaku', { settei, kodomo }, 30000); } catch { r = null; }
    if (!r || !Array.isArray(r.ko)) r = { ...yobiKeikaku(settei, kodomo), dare: 'yobi', sankou: '参考程度・決めるのは先生', wake: 'サーバーにつながらないので、決まった計画の文で出しています。' };
    kaku(claudeWoOboeru('__クラス__', 'keikaku', key, r));
  };
  await yobidasu(false);
}

function seikaiCell(arr, kazu) {
  return arr.length ? arr.map((n) => `${n}／${kazu}`).join('・') : '—';
}
function byou(arr) {
  return arr.length ? arr.map((ms) => (ms == null ? '—' : `${Math.round(ms / 1000)}秒`)).join('・') : '—';
}
// 37便：専門の言葉を使わない（揺れ・候補・向き → たまたまの違い・多く合っていた）
function kekkaBun(m) {
  if (m.kekka === 'mada') return 'まだ2回ずつそろっていないので、比べていません';
  if (m.kekka === 'nashi') return 'どちらの出し方でも、同じくらい合っていました（たまたまの違いより大きい差は出ていません）';
  return `「${DASHIKATA[m.kekka]}」ときのほうが、2回とも多く合っていました（たまたまの違いより大きい差）`;
}
// 37便：先生の画面の上に出す、平易な 1 文（体験版のときは、合った数の事実だけを言う）
function goukei(arr) { return arr.reduce((a, x) => a + x, 0); }
function heiiNaKekka(kind, kai, rec) {
  const mei = TANA_MEI[kind];
  const x = kai.length ? matomeKai(kai, kind) : null;
  const m = matome(rec, kind);
  const [m1, m2] = m.kumi;
  if (x?.kurikaeshi) return `${mei}：別々の日のゲーム ${x.zenHi.length}日のうち ${x.onajiHi.length}日で、「${DASHIKATA[x.kurikaeshi]}」ときのほうが多く合っていました。`;
  if (m.kekka === 'mada') {
    if (!m[m1].length && !m[m2].length) return `${mei}：まだ解いていません。`;
    const [a, b] = [goukei(m[m1]), goukei(m[m2])];
    const [qa, qb] = [m[m1].length * m.kazu, m[m2].length * m.kazu];
    const dochira = !m[m1].length || !m[m2].length ? '片方だけ解きました' : a === b ? '同じくらいでした' : `「${DASHIKATA[a > b ? m1 : m2]}」ときのほうが多く合っていました`;
    return `${mei}：${dochira}（${DASHIKATA[m1]}：${qa}問中 ${a}問、${DASHIKATA[m2]}：${qb}問中 ${b}問）。`;
  }
  if (m.kekka === 'nashi') return `${mei}：どちらの出し方でも、同じくらい合っていました${kai.length > 1 ? '（どの日も、くり返し同じほうが多いことはありませんでした）' : ''}。`;
  return `${mei}：${kai.length > 1 ? `${rec.kai}回目は、` : 'この日は、'}「${DASHIKATA[m.kekka]}」ときのほうが、2回とも多く合っていました。`;
}
// 段階の名前（先生の画面だけ。子どもの画面には出さない）
let dankaiMei = null;
function dankaiNoNamae(kind, L) {
  return dankaiMei?.[kind]?.[String(L)] ?? '';
}

// 結果の表（37便：くわしくの中。jikan：かかった時間の列を出すか）
function tanaHtml(m, { jikan = true } = {}) {
  const [m1, m2] = m.kumi;
  return `
    <h3>${esc(TANA_MEI[m.kind])}</h3>
    <div class="table-wrap"><table>
      <tr><th>出し方</th><th>合った数（1回目・2回目）</th>${jikan ? '<th>かかった時間（参考）</th>' : ''}</tr>
      <tr><td>${esc(DASHIKATA[m1])}</td><td>${seikaiCell(m[m1], m.kazu)}</td>${jikan ? `<td>${byou(m.jikan[m1])}</td>` : ''}</tr>
      <tr><td>${esc(DASHIKATA[m2])}</td><td>${seikaiCell(m[m2], m.kazu)}</td>${jikan ? `<td>${byou(m.jikan[m2])}</td>` : ''}</tr>
    </table></div>
    ${jikan ? `<p class="small">問題の難しさ：${esc(dankaiNoNamae(m.kind, m.dankai))}${m.kirikae ? `（はじめは${esc(dankaiNoNamae(m.kind, m.hajimeDankai))}。途中で難しさを変えたので、最初の2つは練習として数えました）` : ''}</p>
    ${m.kurabenikui?.length ? `<p class="small"><span class="label">比べにくかった</span>${esc(m.kurabenikui.join('・'))}</p>` : ''}
    <p class="small">同じ出し方を2回したときの違い：${m.yure == null ? '—' : `${m.yure}問`}　／　2つの出し方の違い（${esc(DASHIKATA[m2])} − ${esc(DASHIKATA[m1])}）：${m.sa.length ? m.sa.map((n) => `${n > 0 ? '+' : ''}${n}問`).join('、') : '—'}　／　確かめた回数：${m.kakunin}回</p>
    <div class="box soft small"><strong>${esc(kekkaBun(m))}</strong></div>` : ''}`;
}
// 確かめた回数（37便：平易な文に）
function kakuninBun(k) {
  if (typeof k !== 'object' || k == null) return `${k}回`;
  return `${k.回 ? `ゲーム${k.回}回の中で、` : ''}読む・聞くを${k.A}回、文で見る・図で見るを${k.B}回、一気に・区切ってを${k.C}回、比べました（練習の問題は入れていません）`;
}

// 回ごとの結果の表（くわしくの中・本番だけ。37便：専門の言葉を使わない）
function kaiHyouHtml(kai) {
  const rows = [];
  const matome3 = ['A', 'B', 'C'].map((k) => matomeKai(kai, k));
  for (const x of matome3) {
    for (const r of x.rows) {
      rows.push(`<tr><td>${esc(r.kai)}回目<br><span class="muted small">${esc(r.hi || '')}</span></td><td>${esc(TANA_MEI[x.kind])}</td>
        <td>${r.sa.length ? r.sa.map((n) => `${n > 0 ? '+' : ''}${n}`).join('・') : '—'}<br><span class="muted small">${esc(dankaiNoNamae(x.kind, r.dankai))}</span></td>
        <td>${r.muki ? esc(DASHIKATA[r.muki]) : '同じくらい'}</td>
        <td>${r.ookii ? 'はい' : r.yure == null ? '—' : `いいえ（同じ出し方の違い ${r.yure}問）`}</td></tr>`);
    }
  }
  const kuri = matome3.map((x) => `<li>${esc(TANA_MEI[x.kind])}：${x.kurikaeshi ? `<strong>別々の日に、くり返し「${esc(DASHIKATA[x.kurikaeshi])}」ときのほうが多く合っていました</strong>（${x.onaji.join('・')}回目。別々の日は ${x.onajiHi.length} 日）` : x.zenHi.length < 2 ? 'まだ1日分だけなので、日をまたいだ比べはしていません（同じ日に2回したときは、1日として数えます）' : '別々の日に、くり返し同じほうが多いことはありませんでした'}</li>`).join('');
  return `
    <h3>回ごとの結果</h3>
    <p class="muted small">同じ日の中で、2つの出し方の合った数を比べた違いです（あとの出し方 − 先の出し方、2回分）。日によって慣れて合う数が増えるので、別の日の合った数どうしは比べません。比べるのは、同じ難しさの問題の中だけです。</p>
    <div class="table-wrap"><table>
      <tr><th>いつ</th><th>比べたもの</th><th>合った数の違い</th><th>多く合った出し方</th><th>たまたまの違いより大きいか</th></tr>
      ${rows.join('')}
    </table></div>
    <ul class="small">${kuri}</ul>`;
}

// ---- ④ 先生の画面（1人）
async function senseiKo(id) {
  michi(3);
  dare('先生の画面');
  const saishin = await getRecord(id);
  if (!saishin) { app.innerHTML = '<h1>見つかりません</h1>'; return; }
  const kai = await owattaKai(id);
  const rec = kai.length ? kai[kai.length - 1] : saishin; // 比べるのは、終わった回のうちいちばん新しい回
  const tana = await data('tana');
  dankaiMei = tana.段階?.名前 || null;
  const checklist = await data('checklist');
  const cards = await data('cards');
  const ids = await atehamaruIds(id);
  const atehamaru = ids.map((i) => mieruKoumoku(checklist).find((x) => x.id === i)?.文).filter(Boolean);
  const koe = ['A-1', 'A-2', 'A-3', 'A-4'].map((s) => rec.kekka[s]?.koe).filter(Boolean)[0];
  // 先生の画面の見やすさ：上から「いま分かったこと」と「Claude の仮説」→「先生に気をつけてほしいこと」→「授業の手がかり」→「くわしく」。
  // PC の幅では、いま分かったことと仮説、手がかりの2つを横に並べる。
  const { cards: motte } = motteiruCards(kai);
  const kidRenshu = (await getKid(id))?.renshu || [];
  // 37便：上は短く（いま分かったこと・気をつけてほしいこと・次の動き）、数字の表や数え方は「くわしく」に折りたたむ
  const taiken = isTaiken(id);
  const matomeBun = ['A', 'B', 'C'].map((k) => `<li>${esc(heiiNaKekka(k, kai, rec))}</li>`).join('');
  const namae = await namaeOf(id);
  const kuwashiku = (t, naka) => `<details class="box kuwashiku"><summary>くわしく：${t}</summary>${naka}</details>`;
  app.innerHTML = `
    <h1>${esc(namae)}${isDemo(id) ? '（架空の子）' : ''}</h1>
    ${taiken ? '<div class="box chui"><p><strong>仮の結果です。</strong>短い体験（6つの問題だけ）の結果で、本物の測定ではありません。1回だけなので、どの出し方がよいかは、まだ決められません。</p></div>' : ''}
    ${saishin.owari ? '' : `<div class="box chui">${esc(saishin.kai)}回目のゲームの途中です。<a href="#/game/${enc(id)}">続きから始める</a></div>`}
    <p class="muted small">終わったゲーム：${kai.length}回${kai.length ? `（${kai.map((r) => `${r.kai}回目 ${esc(r.hi || '日付なし')}`).join('・')}）` : ''}</p>

    <div class="narabi">
      <section class="box soft">
        <h2>${taiken ? '今回の結果（仮）' : 'いま分かったこと'}</h2>
        <ul>${matomeBun}</ul>
        ${kai.length > 1 ? `<p class="small"><strong>前の回との違い</strong>（${esc(kai[kai.length - 2].kai)}回目 → ${esc(rec.kai)}回目${rec.shurui === 'mijikai' ? '・また見つけるの短いゲーム' : ''}）</p><ul class="small">${maeTonoChigai(kai).map((c) => `<li>${esc(TANA_MEI[c.kind])}：${esc(c.mae)} → ${esc(c.ima)}${c.kawatta ? '' : '（同じ）'}</li>`).join('')}</ul>` : ''}
        <p class="small">子どもが持っているカード：${motte.map((m) => `<strong>${esc(cards.カード[m.card].名前)}</strong>${m.level != null ? `（${esc(levelNoNamae(cards, m))}）` : ''}`).join('・')}</p>
      </section>
      <section>
        <h2>Claude の仮説</h2>
        <div id="kasetsu" class="box" aria-live="polite">${kai.length ? 'Claude が下書きを書いています…' : 'ゲームが終わると、仮説の下書きが出ます。'}</div>
      </section>
    </div>

    <section class="box chui" id="sensei-chui">
      <h2>先生に気をつけてほしいこと</h2>
      <ul>
        <li>この子の中で、出し方ごとに比べた結果です。ほかの子とは比べていません。</li>
        <li>1回や2回の結果で、決めつけないでください。別の日は違うこともあります。</li>
        <li>医療や専門の検査の代わりではありません。</li>
        <li>本人や保護者に伝えるときは、「〇〇のとき、力が出ていたかも」と、あった事実で伝えてください。性格や能力の名前では言いません。</li>
      </ul>
    </section>

    <div class="btns">
      <a class="btn" href="#/tsutae/${enc(id)}">⑤ 伝え方の下書きへ</a>
      <a class="btn sub" href="#/card/${enc(id)}">カードを見る</a>
    </div>

    <h2 class="kugiri-midashi">授業の手がかり</h2>
    <div class="narabi">
      <section>
        <h3>選んだ答え</h3>
        <ul>${kotaeD(rec, tana).map((d) => `<li>${esc(d.toi)} →「${esc(d.kotae ?? '（まだ答えていない）')}」</li>`).join('')}</ul>
      </section>
      <section>
        <h3>チェック項目で当てはまったもの（気づきの候補）</h3>
        ${atehamaru.length ? `<ul>${atehamaru.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted">まだありません。</p>'}
        <p class="muted small">点数にはしません。<a href="#/check">チェック項目を選ぶ</a></p>
      </section>
    </div>

    ${kuwashiku('数字の表と、数え方', `
      <p class="small">どの組も、2つの出し方を、順番を入れかえて2回ずつ試しました。同じ出し方でも、回によって1問くらいは変わります（たまたまの違い）。それより大きい違いが2回とも同じほうに出たときだけ、「多く合っていました」と書きます。読む・聞くの最初の練習と、選んで答える質問は、合った数に入れていません。</p>
      ${['A', 'B', 'C'].map((k) => tanaHtml(matome(rec, k))).join('')}
      <p class="muted small">かかった時間は参考です。問題が画面に出たときから数えます。端末や読み上げで変わるので、結果には入れず、速さで評価しません。</p>
      ${kai.length && !taiken ? kaiHyouHtml(kai) : ''}
      <p class="muted small">読み上げの声：${esc(koe || '記録なし')}</p>`)}
    ${taiken ? '' : kuwashiku('練習の記録（⑥ 育てる）', renshuSenseiHtml(kidRenshu, kai, cards))}
    ${should.hikitsugi?.使う && kai.length && !taiken ? kuwashiku('引き継ぎの記録', `<p class="small">次の年の担任にも、回ごとの結果を並べて渡せる形で書き出します。</p><div class="btns"><button class="sub" id="hikitsugi">引き継ぎの記録を書き出す</button></div><div id="hikitsugi-box"></div>`) : ''}
    ${kuwashiku('ゲームで Claude が次を選んだ理由', `<ol class="small">${(rec.erabi || []).map((e) => `<li>${esc(e.step)}：${esc(e.riyuu)} <span class="muted">（${e.dare === 'claude' ? 'Claude' : '決まった順'}）</span></li>`).join('') || '<li>記録なし</li>'}</ol>`)}`;

  // 引き継ぎの記録の書き出し：Markdown の表にして、ファイルで渡す。書き出す前に言葉を点検する
  const hb = document.getElementById('hikitsugi');
  if (hb) {
    hb.onclick = async () => {
      const bun = hikitsugiNoBun({ id, kai, cards, tana, atehamaru, kakuHi: hiduke() });
      let tenkenBun = '';
      try {
        const r = await api('tenken', { text: bun });
        tenkenBun = r.hits.length ? `使わない言葉が ${r.hits.length} か所あります。書き出したあとで直してください。` : '使わない言葉は入っていませんでした。';
      } catch { tenkenBun = 'サーバーにつながらないので、言葉を確かめられませんでした。'; }
      const url = URL.createObjectURL(new Blob([bun], { type: 'text/markdown' }));
      document.getElementById('hikitsugi-box').innerHTML = `
        <div class="box soft">
          <p>引き継ぎの記録を作りました。${esc(tenkenBun)}</p>
          <div class="btns"><a class="btn" id="hikitsugi-dl" href="${url}" download="引き継ぎ_${esc(id)}_${hiduke()}.md">ファイルで受け取る</a></div>
          <details><summary>中身を見る</summary><pre class="hikitsugi-pre">${esc(bun)}</pre></details>
        </div>`;
    };
  }

  if (!kai.length) return;
  const box = document.getElementById('kasetsu');
  const draw = (k) => {
    box.innerHTML = `
      <p>${whoLabel(k.dare)}<span class="label sankou">${esc(k.sankou)}</span></p>
      <p><span class="label">仮説</span><span class="kasetsu">${esc(k.kasetsu)}</span></p>
      <p>${esc(k.tsugi)}</p>
      <p><span class="label">確かめた回数</span>${esc(kakuninBun(k.kakunin))}</p>
      <p class="small">${esc(k.sankou)}。${k.dare === 'claude' ? 'AI の下書き' : '決まった文の下書き'}なので、そのまま使わず、授業での様子と合わせて先生が判断してください。</p>
      <details class="kuwashiku"><summary>くわしく：そう考えた理由（事実）</summary>
        <ul class="small">${k.konkyo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${k.wake ? `<p class="muted small">${esc(k.wake)}</p>` : ''}
      </details>
      ${oboeHtml(k)}
      <div class="btns"><button class="sub" id="again">もう一度書いてもらう</button></div>`;
    box.querySelector('#again').onclick = () => yobidasu(true);
  };
  const key = motoNoKey({ kai, renshu: kidRenshu, atehamaru: ids, settei: keikakuNoSettei(await gakkoSettei()) });
  const yobidasu = async (force) => {
    // 短い体験では Claude を呼ばない。37便：代わりに、架空の子について Claude が書いて保存した仮説を「見本」として添える
    if (isTaiken(id)) { box.innerHTML = await mihonNoKasetsu(); return; }
    const cached = !force && claudeNoOboe(id, 'kasetsu', key);
    if (cached) { draw(cached); return; }
    // 11便：デモの子は、チェック項目がはじめのままなら、保存した本物の文を出す（呼ばない）
    if (!force && isDemo(id) && JSON.stringify(ids) === JSON.stringify(await hajimeNoChecks(id))) {
      const h = await hozonNoBun(id, 'kasetsu');
      if (h) { draw(h); return; }
    }
    box.textContent = 'Claude が下書きを書いています…';
    try {
      const k = claudeWoOboeru(id, 'kasetsu', key, await api('kasetsu', { record: okuruKiroku(rec), kai: kai.map(okuruKiroku), atehamaru: ids }, 60000));
      draw(k);
    } catch {
      box.innerHTML = '<p>サーバーにつながりませんでした。</p><button class="sub" id="again">もう一度</button>';
      box.querySelector('#again').onclick = () => yobidasu(true);
    }
  };
  yobidasu(false);
}

// ---- ④' チェック項目
async function check() {
  michi(3);
  dare('先生の画面');
  const checklist = await data('checklist');
  const kids = await classList();
  const marks = await checkMarks();
  app.innerHTML = `
    <h1>チェック項目</h1>
    <p>期末や懇談の前に、授業で見た事実に当てはまる子を、項目ごとに選びます。</p>
    <div class="box chui small">点数にしません。基準を作りません。数も数えません。当てはまったことは「気づきの候補」として、その子の先生の画面に残るだけです。</div>
    <div id="items">${mieruKoumoku(checklist).map((it, i, arr) => `
      ${it.まとまり && it.まとまり !== arr[i - 1]?.まとまり ? `<h2>${esc(it.まとまり)}</h2>` : ''}
      <div class="check-item"><div>${esc(it.文)}</div>
        <div class="chips">${kids.map((k) => `<button class="chip" data-item="${it.id}" data-kid="${esc(k.id)}" aria-pressed="${(marks[it.id] || []).includes(k.id)}">${esc(k.名前 || k.id)}</button>`).join('')}</div>
      </div>`).join('')}</div>
    <p class="muted small">名前はすべて架空です。</p>
    <div class="btns"><a class="btn sub" href="#/sensei">先生の画面へもどる</a></div>`;
  app.querySelectorAll('.chip').forEach((b) => {
    b.onclick = async () => {
      const on = await toggleMark(b.dataset.item, b.dataset.kid);
      b.setAttribute('aria-pressed', String(on));
    };
  });
}

// ---- ⑤ 伝え方
async function tsutae(id) {
  michi(4);
  dare('先生の画面');
  const kai = await owattaKai(id);
  if (!kai.length) { app.innerHTML = '<h1>伝え方</h1><p>ゲームが終わると、下書きが出ます。</p>'; return; }
  const rec = kai[kai.length - 1];
  const ids = await atehamaruIds(id);
  app.innerHTML = `<h1>伝え方の下書き（${esc(await namaeOf(id))}）</h1><div id="tsutae" aria-live="polite">Claude が下書きを書いています…</div>`;
  const box = document.getElementById('tsutae');
  const key = motoNoKey({ kai, renshu: (await getKid(id))?.renshu || [], atehamaru: ids, settei: keikakuNoSettei(await gakkoSettei()) });
  const cardsData = await data('cards');
  const draw = (t) => {
    box.innerHTML = `
      <p>${whoLabel(t.dare)}<span class="label sankou">${esc(t.sankou)}</span></p>
      ${oboeHtml(t)}
      ${t.wake ? `<p class="muted small">${esc(t.wake)}</p>` : ''}
      <h2>懇談で口で言う下書き</h2>
      <textarea id="kondan" aria-label="懇談で口で言う下書き">${esc(t.kondan)}</textarea>
      <h2>カードの保護者向け説明（${esc(imaNoNamae(cardsData, t.cardMei))}）</h2>
      <p class="muted small">求められたときに渡すための文です。</p>
      <textarea id="hogosha" aria-label="カードの保護者向け説明">${esc(t.hogosha)}</textarea>
      <h2>学年・教科の先生への一言</h2>
      <p class="muted small">同じ学年や、ほかの教科の先生に伝えるための短い文です。</p>
      <textarea id="hitokoto" aria-label="学年・教科の先生への一言">${esc(t.hitokoto || '')}</textarea>
      <h2>HR の冒頭で先生が話すこと</h2>
      <p class="muted small">ゲームの前に、クラス全体に口で話すための下書きです。この子の結果は入れていません。</p>
      <textarea id="hr" aria-label="HR の冒頭で先生が話すこと">${esc(t.hr || '')}</textarea>
      <div class="btns"><button id="tenken">言葉を確かめる</button><button class="sub" id="again">もう一度書いてもらう</button></div>
      <div id="tenken-kekka" aria-live="polite"></div>
      <p class="muted small">Claude の文は、使わないと決めた言葉が入っていないかを、機械で確かめてから出しています。先生が書きかえたら「言葉を確かめる」で、もう一度確かめられます。決めるのは先生です。</p>
      <div class="btns"><a class="btn sub" href="#/sensei/ko/${enc(id)}">先生の画面へもどる</a></div>`;
    box.querySelector('#again').onclick = () => yobidasu(true);
    box.querySelector('#tenken').onclick = async () => {
      const out = [];
      for (const [name, el] of [['懇談の下書き', box.querySelector('#kondan')], ['保護者向け説明', box.querySelector('#hogosha')], ['先生への一言', box.querySelector('#hitokoto')], ['HR の冒頭の話', box.querySelector('#hr')]]) {
        const r = await api('tenken', { text: el.value });
        if (r.hits.length === 0) { out.push(`<p>${name}：使わない言葉は入っていませんでした。</p>`); continue; }
        const t2 = el.value.normalize('NFKC');
        out.push(`<div class="box chui"><p>${name}：使わない言葉が ${r.hits.length} か所あります。書き直してください。</p><ul>${r.hits.map((h) => `<li>…${esc(t2.slice(Math.max(0, h.位置 - 8), h.位置))}<mark>${esc(t2.slice(h.位置, h.位置 + h.長さ))}</mark>${esc(t2.slice(h.位置 + h.長さ, h.位置 + h.長さ + 8))}… → 代わりの言い方：${esc(h.寄せる言葉)}</li>`).join('')}</ul></div>`);
      }
      box.querySelector('#tenken-kekka').innerHTML = out.join('');
    };
  };
  const yobidasu = async (force) => {
    // 短い体験では Claude を呼ばない。37便：架空の子の保存した懇談の下書きを「見本」として添える
    if (isTaiken(id)) { box.innerHTML = await mihonNoTsutae(); return; }
    const cached = !force && claudeNoOboe(id, 'tsutae', key);
    if (cached) { draw(cached); return; }
    if (!force && isDemo(id) && JSON.stringify(ids) === JSON.stringify(await hajimeNoChecks(id))) {
      const h = await hozonNoBun(id, 'tsutae');
      if (h) { draw(h); return; }
    }
    box.textContent = 'Claude が下書きを書いています…';
    try {
      const t = claudeWoOboeru(id, 'tsutae', key, await api('tsutae', { record: okuruKiroku(rec), kai: kai.map(okuruKiroku), atehamaru: ids }, 60000));
      draw(t);
    } catch {
      box.innerHTML = '<p>サーバーにつながりませんでした。</p><button class="sub" id="again">もう一度</button>';
      box.querySelector('#again').onclick = () => yobidasu(true);
    }
  };
  yobidasu(false);
}

// ---- 子どもの安全とプライバシー（docs/子どもの安全とプライバシー.md の写しを出す）
function mdNoHtml(md) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https:\/\/[^\s）)]+)/g, '<a href="$1" rel="noopener" target="_blank">$1</a>');
  const out = [];
  let list = false;
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    out.push(`<div class="table-wrap"><table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('')}</table></div>`);
    table = [];
  };
  for (const line of md.split('\n')) {
    if (line.startsWith('|')) { table.push(line); continue; }
    flushTable();
    if (list && !line.startsWith('- ')) { out.push('</ul>'); list = false; }
    if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('> ')) out.push(`<p class="draft">${inline(line.slice(2))}</p>`);
    else if (line.startsWith('- ')) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();
  if (list) out.push('</ul>');
  return out.join('');
}

async function anzen() {
  michi(null);
  dare('');
  try {
    const md = await (await fetch('anzen.md')).text();
    app.innerHTML = `<div class="md-page">${mdNoHtml(md)}</div><div class="btns"><a class="btn sub" href="#/">はじめの画面へ</a></div>`;
  } catch {
    app.innerHTML = '<h1>子どもの安全とプライバシー</h1><p>ページを開けませんでした。</p>';
  }
}

// ---- 13便のもと：棚 B の文の版と図の版を、先生が並べて見比べる（1回のゲームでは片方しか出ないため）
async function mikurabe(id, mode, i) {
  const tana = await data('tana');
  const B = tana.B.問題;
  if (id && B[id]) {
    // 子どもの画面と同じ見た目で、1つの版だけを出す（押しても記録しない）
    michi(1);
    dare('子どもの画面');
    document.body.dataset.hakaru = '1';
    const n = Math.min(Number(i) || 0, B[id].問い.length - 1);
    app.innerHTML = `<p class="tsugi-ichibun" id="riyuu">次は ${mode === 'zu' ? '🗺️ 図で見る' : '📝 文で見る'}</p><div id="game-naka">${bamenNoGamen(B[id], mode, n)}</div>
      <p class="small"><a href="#/mikurabe">見比べる画面へ戻る</a>（この画面で押しても、記録は残りません）</p>`;
    return;
  }
  michi(3);
  dare('先生の画面');
  const dan = tana.段階.名前.B;
  const ichiran = Object.entries(B).sort((a, b) => a[1].段階 - b[1].段階 || a[0].localeCompare(b[0]));
  app.innerHTML = `
    <h1>「文で見る／図で見る」の問題を見比べる（文の版と図の版）</h1>
    <p>ゲームでは、1つの場面を、文だけ（文で見る）か図だけ（図で見る）のどちらかで出します。ここでは両方を並べます。答えは<strong>太字</strong>です。</p>
    <p class="muted small">下書き（先生未確認）。「子どもの画面で見る」で、ゲームと同じ見た目で開けます（押しても記録は残りません）。</p>
    ${ichiran.map(([k, q]) => `<section class="box mikurabe">
      <h2>${esc(k)}　${esc(q.題)}（${esc(dan[q.段階])}）</h2>
      <div class="mikurabe-ni"><div><h3>文の版</h3><div class="honbun">${esc(q.文)}</div></div><div><h3>図の版</h3><div class="box">${bamenZu(q.図)}</div></div></div>
      <ol>${q.問い.map((t, n) => `<li>${esc(t.文)}<br>${t.選択肢.map((c, m) => (m === t.答え ? `<strong>${esc(c)}</strong>` : esc(c))).join('　')}
        <br><span class="small"><a href="#/mikurabe/${enc(k)}/bun/${n}">子どもの画面で見る（文）</a>　<a href="#/mikurabe/${enc(k)}/zu/${n}">子どもの画面で見る（図）</a></span></li>`).join('')}</ol>
    </section>`).join('')}
    <div class="btns"><a class="btn sub" href="#/sensei">先生の画面へ戻る</a></div>`;
}

// ---- 画面の切りかえ
async function route() {
  tomeru();
  try { yobina = await gakkoSettei(); } catch { /* はじめの値のまま */ }
  gameWoHanareru(); // 前のゲームの続きが、これから開く画面に描かないように
  delete document.body.dataset.hakaru;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
  const [a, b, c2] = parts;
  try {
    if (!a) await top();
    else if (a === 'annai') await annai(b);
    else if (a === 'hajimeru') await hajimeru(b);
    else if (a === 'game') { michi((await getRecord(b))?.shurui === 'mijikai' ? 6 : 1); dare(isOtona(b) ? '大人が試す画面' : '子どもの画面'); await gameScreen(app, b); }
    else if (a === 'card') await card(b);
    else if (a === 'sodateru') { michi(5); dare(isOtona(b) ? '大人が試す画面' : '子どもの画面'); await sodateruGamen(app, b); }
    else if (a === 'sensei' && b === 'ko') await senseiKo(c2);
    else if (a === 'sensei') await senseiHub();
    else if (a === 'check') await check();
    else if (a === 'mikurabe') await mikurabe(b, c2, parts[3]);
    else if (a === 'tsutae') await tsutae(b);
    else if (a === 'anzen') await anzen();
    else await top();
  } catch (e) {
    console.error(e); // くわしい中身は開発者の画面にだけ出す（英語のまま画面に出さない）
    app.innerHTML = '<h1>うまく開けませんでした</h1><p>もう一度、はじめの画面から開いてください。続くときは、先生に知らせてください。</p><p><a href="#/">はじめの画面へ</a></p>';
  }
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

async function main() {
  try {
    joutai = await api('joutai', null, 8000);
  } catch {
    // サーバーにつながらないときの写し（言葉の正本と同じ文。scripts/tenken.mjs で同じかを確かめる）
    joutai = { ai: false, soudan: SOUDAN_UTSUSHI, soudanKo: SOUDAN_KO_UTSUSHI, soudanOtona: SOUDAN_OTONA_UTSUSHI };
  }
  document.getElementById('ai-joutai').textContent = joutai.ai
    ? 'いまは Claude を使っています。使えないときは、決まった順と決まった文に切りかわります。'
    : 'いまは Claude を使わず、決まった順と決まった文で動いています。';
  try { should = await data('should'); } catch { should = {}; }
  setSettei({ ai: Boolean(joutai.ai), renshu: Boolean(should.renshu?.使う) });
  // 右上の「▶ 読む」：読んでいるあいだは「■ 止める」。もう一度押すと止まる。この端末で読めないときは、その場で短く知らせる（端末で差が出ないように、黙って何も起きない形にしない）
  const yomuBtn = document.getElementById('yomu-ue');
  let yondeiru = false;
  const modosu = () => { yondeiru = false; yomuBtn.textContent = '▶ 読む'; yomuBtn.setAttribute('aria-label', 'この画面を読み上げる'); };
  yomuBtn.onclick = async () => {
    if (yondeiru) { tomeru(); modosu(); return; }
    tomeru();
    await junbiYomiage();
    const moji = yomuMojiretsu();
    if (!moji) return;
    if (!yomeru(moji)) {
      yomuBtn.textContent = 'この端末では 読めません';
      setTimeout(modosu, 2500);
      return;
    }
    yondeiru = true;
    yomuBtn.textContent = '■ 止める';
    yomuBtn.setAttribute('aria-label', '読み上げを止める');
    await yomu(moji);
    if (yondeiru) modosu();
  };
  window.addEventListener('hashchange', () => { tomeru(); modosu(); });
  window.addEventListener('hashchange', route);
  route();
}
main();
