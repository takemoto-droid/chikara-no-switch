// 画面の切りかえと、①案内・③カード・④先生の画面・⑤伝え方・⑥学習につなぐ
import { esc, api, data, okuruKiroku, whoLabel, MICHI } from './util.js';
import { getRecord, getKid, owattaKai, newKai, isDemo, newKid, localKids, classList, checkMarks, toggleMark, atehamaruIds, aiCache, demo } from './kiroku.js';
import { matome, matomeKai, erabuCardKai, motteiruCards, cardNoBun, kotaeD, DASHIKATA, TANA_MEI, mieruKoumoku } from './kurabe.js';
import { gameScreen } from './game.js';
import { junbiYomiage, yomu, tomeru } from './yomiage.js';
import { tapeZu } from './zu.js';

export const SOUDAN_UTSUSHI = '気になることや困っていることがあれば、いつでも担任の先生や、学校の相談の窓口に話してください。このゲームの結果があってもなくても、相談はできます。';
const app = document.getElementById('app');
let joutai = { ai: false, soudan: '' };

function michi(ima) {
  const nav = document.getElementById('michi');
  nav.innerHTML = ima == null ? '' : MICHI.map((m, i) => `<span class="${i === ima ? 'ima' : ''}">${esc(m)}</span>`).join('');
}
function dare(t) {
  document.getElementById('dare').textContent = t || '';
}
function soudanHtml() {
  return `<div class="box soudan"><h3>相談したいとき</h3><p>${esc(joutai.soudan)}</p></div>`;
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
      <a href="#/sensei"><div class="box"><strong>保存した結果を見る</strong><br><span class="muted">架空の子の結果を、先生の画面で見ます。1回だけの子（差が出た子・差が出なかった子）と、3回分の記録がある子がいます。</span></div></a>
      <a href="#/annai/ko"><div class="box"><strong>その場で動かす</strong><br><span class="muted">①案内 → ②ゲーム → ③カード → ④先生の画面 → ⑤伝え方 → ⑥学習につなぐ、を順に動かします。</span></div></a>
    </div>
    ${mada.length ? `<div class="box soft"><h3>途中で止めたゲーム</h3>${mada.map((k) => `<p><a href="#/game/${enc(k.id)}">${esc(k.id)} の続きから始める</a></p>`).join('')}</div>` : ''}
    <h2>案内</h2>
    <p><a href="#/annai/ko">子ども向けの案内</a>　<a href="#/annai/hogo">保護者向けの案内</a></p>`;
}

// ---- ① 案内
async function annai(who) {
  michi(0);
  const a = (await data('annai'))[who === 'ko' ? '子ども' : '保護者'];
  dare(who === 'ko' ? '子どもの画面' : '保護者の画面');
  app.innerHTML = `
    <h1>${esc(a.題)}</h1>
    ${a.段.map((d) => `<h2>${esc(d.見出し)}</h2><p>${esc(d.文)}</p>`).join('')}
    ${soudanHtml()}
    <div class="btns">
      ${who === 'ko'
        ? '<a class="btn" href="#/hajimeru">ゲームをはじめる</a><a class="btn sub" href="#/annai/hogo">保護者向けの案内</a>'
        : '<a class="btn" href="#/annai/ko">子ども向けの案内へ</a>'}
    </div>`;
}

async function hajimeru() {
  const id = newKid();
  location.replace(`#/game/${enc(id)}`);
}

// ---- ③ スイッチカード
async function card(id) {
  michi(2);
  dare('子どもの画面');
  const rec = await getRecord(id);
  const kai = await owattaKai(id);
  if (!rec || !kai.length) {
    app.innerHTML = `<h1>スイッチカード</h1><p>ゲームが終わると、カードが届きます。</p>${rec ? `<p><a class="btn" href="#/game/${enc(id)}">続きから始める</a></p>` : ''}`;
    return;
  }
  const cards = await data('cards');
  const { cards: motte, atarashii } = motteiruCards(kai);
  const tsugiNoKai = !isDemo(id) && rec.owari;
  const hyouji = (m) => cardHtml(cardNoBun(cards.カード[m.card], m.kurikaeshi), {
    atarashii: kai.length > 1 && atarashii.includes(m.card),
    moratta: m.kai ? `${m.kai}回目のゲーム${m.hi ? `（${m.hi}）` : ''}のあとで、もらったカード` : '',
  });
  const [mae, ...ushiro] = motte;
  app.innerHTML = `
    <h1>あなたのスイッチカード</h1>
    ${hyouji(mae)}
    ${ushiro.length ? `<h2>持っているカード</h2><p class="muted small">これまでのゲームで、もらったカードです。</p>${ushiro.map(hyouji).join('')}` : ''}
    <p class="muted">カードは、力を出しやすかった出し方のしるしです。他の人とは比べていません。</p>
    ${soudanHtml()}
    <div class="btns">
      <a class="btn" href="#/gakushu/${enc(id)}">このスイッチで数学の問題を解く（⑥）</a>
      <a class="btn sub" href="#/sensei/ko/${enc(id)}">ここからは先生が見ます（④先生の画面）</a>
    </div>
    ${rec.owari ? '' : `<div class="box soft"><p>${esc(rec.kai)}回目のゲームの途中です。</p><a class="btn sub" href="#/game/${enc(id)}">続きから始める</a></div>`}
    ${tsugiNoKai ? `<div class="box soft"><p>別の日に、もう一度ゲームをすると、回をまたいで比べられます（いまは ${kai.length} 回）。</p><button class="sub" id="tsugi-kai">別の日の回を始める</button></div>` : ''}`;
  const b = document.getElementById('tsugi-kai');
  if (b) b.onclick = () => { if (newKai(id)) location.hash = `#/game/${enc(id)}`; };
}

function cardHtml(c, { atarashii = false, moratta = '' } = {}) {
  return `<div class="switch-card" style="background:${esc(c.色)}">
      ${atarashii ? '<p class="atarashii">あたらしいカード</p>' : ''}
      <p class="mei">${esc(c.名前)}</p>
      ${moratta ? `<p class="moratta">${esc(moratta)}</p>` : ''}
      <p class="hitokoto">${esc(c.ひとこと)}</p>
      <div class="naka">
        <h3>これは何か</h3><p>${esc(c.これは何か)}</p>
        <h3>自分でできる使い方</h3><ul>${c.自分でできる使い方.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>先生にお願いしてよいこと</h3><ul>${c.先生にお願いしてよいこと.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
    </div>`;
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
    ${Object.keys(d.結果).map((id) => `<p><a href="#/sensei/ko/${enc(id)}">${esc(d.クラス.find((k) => k.id === id).呼び名)}</a></p>`).join('')}
    <h2>この端末で動かした子</h2>
    ${local.length ? local.map((k) => `<p><a href="#/sensei/ko/${enc(k.id)}">${esc(k.id)}</a>（${k.kaisu}回${k.owari ? '' : '・ゲームの途中'}）</p>`).join('') : '<p class="muted">まだありません。</p>'}
    <h2>チェック項目</h2>
    <p><a href="#/check">クラスで「当てはまる子」を選ぶ</a></p>`;
}

function seikaiCell(arr, kazu) {
  return arr.length ? arr.map((n) => `${n}／${kazu}`).join('・') : '—';
}
function byou(arr) {
  return arr.length ? arr.map((ms) => (ms == null ? '—' : `${Math.round(ms / 1000)}秒`)).join('・') : '—';
}
function kekkaBun(m) {
  if (m.kekka === 'mada') return 'まだ2回そろっていないので、比べていない';
  if (m.kekka === 'nashi') return '揺れより大きい差は、同じ向きに2回は出なかった。どちらの出し方でも同じくらい力を出せた（差なし）';
  return `「${DASHIKATA[m.kekka]}」のほうが、2回とも、揺れより大きく正解が多かった（候補）`;
}
function tanaHtml(m) {
  const [m1, m2] = m.kumi;
  return `
    <h3>${esc(TANA_MEI[m.kind])}</h3>
    <div class="table-wrap"><table>
      <tr><th>出し方</th><th>正解（1回目・2回目）</th><th>かかった時間</th></tr>
      <tr><td>${esc(DASHIKATA[m1])}</td><td>${seikaiCell(m[m1], m.kazu)}</td><td>${byou(m.jikan[m1])}</td></tr>
      <tr><td>${esc(DASHIKATA[m2])}</td><td>${seikaiCell(m[m2], m.kazu)}</td><td>${byou(m.jikan[m2])}</td></tr>
    </table></div>
    <p class="small">同じ出し方を2回やったときの揺れ：${m.yure == null ? '—' : `${m.yure}問`}　／　${esc(DASHIKATA[m2])}−${esc(DASHIKATA[m1])} の差：${m.sa.length ? m.sa.map((n) => `${n > 0 ? '+' : ''}${n}問`).join('、') : '—'}　／　確かめた回数：${m.kakunin}回</p>
    <div class="box soft small"><strong>${esc(kekkaBun(m))}</strong></div>`;
}
function kakuninBun(k) {
  if (typeof k !== 'object' || k == null) return `${k}回`;
  return `${k.回 ? `ゲーム ${k.回}回で、` : ''}読む／聞く ${k.A}組・文で見る／図で見る ${k.B}組・一気に／区切って ${k.C}組`;
}

// (a') 回ごとの「出し方の差」の表（3便）
function kaiHyouHtml(kai) {
  const rows = [];
  const matome3 = ['A', 'B', 'C'].map((k) => matomeKai(kai, k));
  for (const x of matome3) {
    const [m1, m2] = x.kumi;
    for (const r of x.rows) {
      rows.push(`<tr><td>${esc(r.kai)}回目<br><span class="muted small">${esc(r.hi || '')}</span></td><td>${esc(TANA_MEI[x.kind])}</td>
        <td>${r.sa.length ? r.sa.map((n) => `${n > 0 ? '+' : ''}${n}`).join('・') : '—'}</td>
        <td>${r.muki ? esc(DASHIKATA[r.muki]) : '向きなし'}</td>
        <td>${r.ookii ? 'はい（その回の候補）' : r.yure == null ? '—' : `いいえ（揺れ ${r.yure}）`}</td></tr>`);
    }
  }
  const kuri = matome3.map((x) => `<li>${esc(TANA_MEI[x.kind])}：${x.kurikaeshi ? `<strong>くり返し出た候補「${esc(DASHIKATA[x.kurikaeshi])}」</strong>（${x.onaji.join('・')}回目で同じ向き。別々の日は ${x.onajiHi.length} 日）` : x.zenHi.length < 2 ? 'まだ1日分だけなので、回をまたいだ比べはしていない（同じ日の回は1日として数える）' : 'くり返し出た候補はない'}</li>`).join('');
  return `
    <h2>(a') 回ごとの「出し方の差」</h2>
    <p class="muted small">差は、その回の中の「${esc(DASHIKATA.kiku)}−${esc(DASHIKATA.yomu)}」のように、2つ目の出し方から1つ目の出し方を引いた正解の差（1組目・2組目）。素点は回ごとに比べません（2回目は慣れて正解が増えやすいため）。「くり返し出た候補」は、ある回でその回の候補になり、別の日の回でも同じ向きの差が出て、反対向きの候補が無いときだけです。同じ日に2回したときは、1日として数えます。</p>
    <div class="table-wrap"><table>
      <tr><th>いつ</th><th>棚</th><th>差</th><th>向き</th><th>揺れより大きいか</th></tr>
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
  const checklist = await data('checklist');
  const cards = await data('cards');
  const ids = await atehamaruIds(id);
  const atehamaru = ids.map((i) => mieruKoumoku(checklist).find((x) => x.id === i)?.文).filter(Boolean);
  const koe = ['A-1', 'A-2', 'A-3', 'A-4'].map((s) => rec.kekka[s]?.koe).filter(Boolean)[0];
  const erabi = erabuCardKai(kai);
  const card = cardNoBun(cards.カード[erabi.card], erabi.kurikaeshi);

  app.innerHTML = `
    <h1>${esc(id)}${isDemo(id) ? '（架空の子）' : ''}</h1>
    ${saishin.owari ? '' : `<div class="box chui">${esc(saishin.kai)}回目のゲームの途中です。<a href="#/game/${enc(id)}">続きから始める</a></div>`}
    <p class="muted small">終わったゲーム：${kai.length}回${kai.length ? `（${kai.map((r) => `${r.kai}回目 ${esc(r.hi || '日付なし')}`).join('・')}）` : ''}</p>

    ${kai.length ? kaiHyouHtml(kai) : ''}

    <h2>(a) ${kai.length > 1 ? `いちばん新しい回（${esc(rec.kai)}回目）の結果` : '結果'}：本人の中で、出し方ごとに比べたもの</h2>
    <p class="muted small">どの組も ABBA の順で2回ずつ比べました。「候補」は、同じ出し方を2回やったときの揺れより大きい差が、同じ向きに2回出たときだけです。読む／聞くの練習の1組は、比べる数に入れていません。</p>
    ${['A', 'B', 'C'].map((k) => tanaHtml(matome(rec, k))).join('')}
    <p class="muted small">読み上げの声：${esc(koe || '記録なし')}</p>
    <p>子どもに渡したカード：<strong>${esc(card.名前)}</strong>（${esc(card.ひとこと)}）</p>

    <h2>(b) 選んだ答え</h2>
    <p class="muted small">比べる数には入れていません。</p>
    <ul>${kotaeD(rec, tana).map((d) => `<li>${esc(d.toi)} →「${esc(d.kotae ?? '（まだ答えていない）')}」</li>`).join('')}</ul>

    <h2>(c) チェック項目で当てはまったもの（気づきの候補）</h2>
    ${atehamaru.length ? `<ul>${atehamaru.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted">まだありません。</p>'}
    <p class="muted small">点数にしません。基準もありません。<a href="#/check">チェック項目を選ぶ</a></p>

    <h2>(d) Claude の仮説</h2>
    <div id="kasetsu" class="box" aria-live="polite">${kai.length ? 'Claude が下書きを書いています…' : 'ゲームが終わると、仮説の下書きが出ます。'}</div>

    <details class="box"><summary>ゲームで Claude が次を選んだ理由の記録</summary>
      <ol class="small">${(rec.erabi || []).map((e) => `<li>${esc(e.step)}：${esc(e.riyuu)} <span class="muted">（${e.dare === 'claude' ? 'Claude' : '決まった順'}）</span></li>`).join('') || '<li>記録なし</li>'}</ol>
    </details>

    <div class="btns">
      <a class="btn" href="#/tsutae/${enc(id)}">⑤ 伝え方の下書きへ</a>
      <a class="btn sub" href="#/gakushu/${enc(id)}">⑥ 学習につなぐ</a>
      <a class="btn sub" href="#/card/${enc(id)}">カードを見る</a>
    </div>`;

  if (!kai.length) return;
  const box = document.getElementById('kasetsu');
  const draw = (k) => {
    box.innerHTML = `
      <p>${whoLabel(k.dare)}<span class="label sankou">${esc(k.sankou)}</span></p>
      <p><span class="label">仮説</span><span class="kasetsu">${esc(k.kasetsu)}</span></p>
      <p>${esc(k.tsugi)}</p>
      <p><span class="label">確かめた回数</span>${esc(kakuninBun(k.kakunin))}（比べた組の数。練習は入れていない）</p>
      <h3>そう考えた理由（事実）</h3>
      <ul class="small">${k.konkyo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="muted small">${esc(k.sankou)}。${k.dare === 'claude' ? 'AI の下書き' : '決まった文の下書き'}なので、そのまま使わず、授業での様子と合わせて先生が判断してください。${k.wake ? esc(k.wake) : ''}</p>
      <div class="btns"><button class="sub" id="again">もう一度書いてもらう</button></div>`;
    box.querySelector('#again').onclick = () => yobidasu(true);
  };
  const key = JSON.stringify({ k: kai.map((r) => r.kekka), ids });
  const yobidasu = async (force) => {
    const cached = !force && aiCache(id, 'kasetsu', key);
    if (cached) { draw(cached); return; }
    box.textContent = 'Claude が下書きを書いています…';
    try {
      const k = await api('kasetsu', { record: okuruKiroku(rec), kai: kai.map(okuruKiroku), atehamaru: ids }, 60000);
      aiCache(id, 'kasetsu', key, k);
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
        <div class="chips">${kids.map((k) => `<button class="chip" data-item="${it.id}" data-kid="${esc(k.id)}" aria-pressed="${(marks[it.id] || []).includes(k.id)}">${esc(k.id)}</button>`).join('')}</div>
      </div>`).join('')}</div>
    <p class="muted small">子の名前の代わりに、架空の呼び名を出しています。</p>
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
  app.innerHTML = `<h1>伝え方の下書き（${esc(id)}）</h1><div id="tsutae" aria-live="polite">Claude が下書きを書いています…</div>`;
  const box = document.getElementById('tsutae');
  const key = JSON.stringify({ k: kai.map((r) => r.kekka), ids });
  const draw = (t) => {
    box.innerHTML = `
      <p>${whoLabel(t.dare)}<span class="label sankou">${esc(t.sankou)}</span></p>
      ${t.wake ? `<p class="muted small">${esc(t.wake)}</p>` : ''}
      <h2>懇談で口で言う下書き</h2>
      <textarea id="kondan" aria-label="懇談で口で言う下書き">${esc(t.kondan)}</textarea>
      <h2>カードの保護者向け説明（${esc(t.cardMei)}）</h2>
      <p class="muted small">求められたときに渡すための文です。</p>
      <textarea id="hogosha" aria-label="カードの保護者向け説明">${esc(t.hogosha)}</textarea>
      <div class="btns"><button id="tenken">言葉を点検する</button><button class="sub" id="again">もう一度書いてもらう</button></div>
      <div id="tenken-kekka" aria-live="polite"></div>
      <p class="muted small">Claude の文は、言葉の正本で点検してから出しています。先生が書きかえたら「言葉を点検する」で、もう一度確かめられます。決めるのは先生です。</p>
      <div class="btns"><a class="btn" href="#/gakushu/${enc(id)}">⑥ 学習につなぐ</a><a class="btn sub" href="#/sensei/ko/${enc(id)}">先生の画面へもどる</a></div>`;
    box.querySelector('#again').onclick = () => yobidasu(true);
    box.querySelector('#tenken').onclick = async () => {
      const out = [];
      for (const [name, el] of [['懇談の下書き', box.querySelector('#kondan')], ['保護者向け説明', box.querySelector('#hogosha')]]) {
        const r = await api('tenken', { text: el.value });
        if (r.hits.length === 0) { out.push(`<p>${name}：避ける言葉は見つかりませんでした。</p>`); continue; }
        const t2 = el.value.normalize('NFKC');
        out.push(`<div class="box chui"><p>${name}：避ける言葉が ${r.hits.length} か所あります。書き直してください。</p><ul>${r.hits.map((h) => `<li>…${esc(t2.slice(Math.max(0, h.位置 - 8), h.位置))}<mark>${esc(t2.slice(h.位置, h.位置 + h.長さ))}</mark>${esc(t2.slice(h.位置 + h.長さ, h.位置 + h.長さ + 8))}… → 寄せる言葉：${esc(h.寄せる言葉)}</li>`).join('')}</ul></div>`);
      }
      box.querySelector('#tenken-kekka').innerHTML = out.join('');
    };
  };
  const yobidasu = async (force) => {
    const cached = !force && aiCache(id, 'tsutae', key);
    if (cached) { draw(cached); return; }
    box.textContent = 'Claude が下書きを書いています…';
    try {
      const t = await api('tsutae', { record: okuruKiroku(rec), kai: kai.map(okuruKiroku), atehamaru: ids }, 60000);
      aiCache(id, 'tsutae', key, t);
      draw(t);
    } catch {
      box.innerHTML = '<p>サーバーにつながりませんでした。</p><button class="sub" id="again">もう一度</button>';
      box.querySelector('#again').onclick = () => yobidasu(true);
    }
  };
  yobidasu(false);
}

// ---- ⑥ 学習につなぐ
async function gakushu(id) {
  michi(5);
  dare('子どもの画面');
  const rec = await getRecord(id);
  const kai = rec ? await owattaKai(id) : [];
  const g = (await data('gakushu')).問題;
  const cards = await data('cards');
  const erabi = erabuCardKai(kai);
  const cardId = erabi.card;
  const c = cardNoBun(cards.カード[cardId], erabi.kurikaeshi);
  const yomiageOK = await junbiYomiage();
  const sw = { kiku: cardId === 'kiku', kugiri: cardId === 'kugiru', zu: cardId === 'zu' };
  const naze = {
    kiku: 'きくスイッチで出しています。問題文を読み上げます。',
    zu: 'ずスイッチで出しています。場面の図を添えています。',
    kugiru: 'くぎるスイッチで出しています。問題文を一文ずつ分けています。',
    yomu: 'よむスイッチで出しています。自分のペースで、何回でも読み返せます。',
    dore: 'どれでもスイッチです。使いたいスイッチを、自分で選んでね。',
    tameshita: '使いたいスイッチを、自分で選んでね。',
  }[cardId];
  const zenbun = g.本文.join('');
  const draw = () => {
    app.innerHTML = `
      <h1>学習につなぐ：数学の問題</h1>
      <p><span class="label" style="background:${esc(c.色)};color:#fff">${esc(c.名前)}</span>${esc(naze)}</p>
      <div class="toggle" role="group" aria-label="出し方のスイッチ">
        <button data-sw="kiku" aria-pressed="${sw.kiku}" ${yomiageOK ? '' : 'disabled'}>読み上げ</button>
        <button data-sw="kugiri" aria-pressed="${sw.kugiri}">一文ずつ</button>
        <button data-sw="zu" aria-pressed="${sw.zu}">図で見る</button>
      </div>
      ${yomiageOK ? '' : '<p class="muted small">この端末では読み上げが使えません。</p>'}
      <div class="honbun" style="margin-top:12px">${sw.kugiri ? g.本文.map((x) => `<p>${esc(x)}</p>`).join('') : esc(zenbun)}</div>
      ${sw.kiku ? '<div class="btns"><button class="sub" id="play">▶ 問題文を聞く</button></div>' : ''}
      ${sw.zu ? `<div class="box">${tapeZu(g.図)}</div>` : ''}
      <div class="btns tate">${g.選択肢.map((x, i) => `<button class="choice" data-i="${i}">${esc(x)}</button>`).join('')}</div>
      <div id="kotae" aria-live="polite"></div>
      <p class="draft">この問題は下書き（先生未確認）です。</p>
      <div class="btns"><a class="btn sub" href="#/">はじめの画面へ</a>${rec ? `<a class="btn sub" href="#/sensei/ko/${enc(id)}">先生の画面へ</a>` : ''}</div>`;
    app.querySelectorAll('[data-sw]').forEach((b) => {
      b.onclick = () => { sw[b.dataset.sw] = !sw[b.dataset.sw]; tomeru(); draw(); };
    });
    const play = app.querySelector('#play');
    if (play) play.onclick = () => yomu(zenbun);
    app.querySelectorAll('.choice').forEach((b) => {
      b.onclick = () => {
        const ok = Number(b.dataset.i) === g.答え;
        app.querySelector('#kotae').innerHTML = ok
          ? `<div class="box soft"><p><strong>正解です。</strong></p><p>${esc(g.とき方)}</p></div>`
          : `<div class="box"><p>もう一度考えてみよう。</p><p>ヒント：${esc(g.ヒント)}</p></div>`;
      };
    });
  };
  draw();
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

// ---- 画面の切りかえ
async function route() {
  tomeru();
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
  const [a, b, c2] = parts;
  try {
    if (!a) await top();
    else if (a === 'annai') await annai(b);
    else if (a === 'hajimeru') await hajimeru();
    else if (a === 'game') { michi(1); dare('子どもの画面'); await gameScreen(app, b); }
    else if (a === 'card') await card(b);
    else if (a === 'sensei' && b === 'ko') await senseiKo(c2);
    else if (a === 'sensei') await senseiHub();
    else if (a === 'check') await check();
    else if (a === 'tsutae') await tsutae(b);
    else if (a === 'gakushu') await gakushu(b);
    else if (a === 'anzen') await anzen();
    else await top();
  } catch (e) {
    app.innerHTML = `<h1>うまく開けませんでした</h1><p>${esc(e.message)}</p><p><a href="#/">はじめの画面へ</a></p>`;
  }
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

async function main() {
  try {
    joutai = await api('joutai', null, 8000);
  } catch {
    // サーバーにつながらないときの写し（言葉の正本と同じ文。scripts/tenken.mjs で同じかを確かめる）
    joutai = { ai: false, soudan: SOUDAN_UTSUSHI };
  }
  document.getElementById('ai-joutai').textContent = joutai.ai
    ? 'いまは Claude を使っています。使えないときは、決まった順の予備の動きに切りかわります。'
    : 'いまは Claude を使わず、決まった順の予備の動きで出しています。';
  window.addEventListener('hashchange', route);
  route();
}
main();
