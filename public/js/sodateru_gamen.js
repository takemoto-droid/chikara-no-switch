// ⑥ 育てる（朝の練習）の画面。得意な出し方を支えにして、もう一方の出し方を、支えを少しずつ減らしながら練習する。
// 「今日はやらない」を選べる。記録は本人のもの（この端末の中だけ）。子どもの画面に、難しさの段階と「苦手」の言葉は出さない。
import { esc, api, data } from './util.js';
import { getKid, saveRenshu, isDemo, hiduke } from './kiroku.js';
import { cardNoFukudai, levelNoNamae } from './kurabe.js';
import {
  sodateKouho, jibunDeErabu, danWoDasu, renshuNoDankai, hitotsuNoKazu, yobiKyou, kyouNoRiyuu, agariNoRiyuu,
  erabuMondai, sodateCards, sodateCardNoBun, SODATE_MODES, SODATE_MEI, DAN_NO_DASHIKATA, DAN_JOUGEN, TANA_OF,
} from './sodateru.js';
import { gakkoSettei } from './gakko.js';
import { junbiYomiage, yomu, tomeru } from './yomiage.js';
import { tapeZu } from './zu.js';
import { cardHtml } from './card_html.js';

const enc = encodeURIComponent;
export const RAKU = ['前より楽になった', '同じくらい', 'むずかしかった'];
const KOTAENAI = '今は答えない';

// 練習の記録（本人の画面・先生の画面で同じ並び）
export function renshuKirokuHtml(renshu, { sensei = false } = {}) {
  if (!renshu.length) return '<p class="muted">まだ練習していません。</p>';
  const gyou = renshu.map((r) => {
    if (r.yasumi) return `<tr><td>${esc(r.hi)}</td><td colspan="${sensei ? 5 : 4}">今日はやらない、を選んだ</td></tr>`;
    const hs = r.hitotsu || [];
    if (!hs.length) return `<tr><td>${esc(r.hi)}</td><td colspan="${sensei ? 5 : 4}">始めたところで止めた</td></tr>`;
    const mode = hs[0].mode;
    const dans = [...new Set(hs.map((h) => h.dan))];
    const seikai = hs.reduce((s, h) => s + h.seikai, 0);
    const kazu = hs.reduce((s, h) => s + h.kazu, 0);
    const oshita = hs.filter((h) => h.dan === 3 && (mode === 'yomu' || mode === 'kiku')).map((h) => h.oshita ?? 0);
    return `<tr><td>${esc(r.hi)}</td><td>${esc(SODATE_MEI[mode])}${r.jibun && sensei ? '（本人が選んだ）' : ''}</td><td>${dans.map((d) => esc(DAN_NO_DASHIKATA[mode][d - 1])).join(' → ')}</td><td>${hs.length}つ・正解 ${seikai}／${kazu}${sensei && oshita.length ? `・押した回数 ${oshita.join('・')}` : ''}</td>${sensei ? `<td>${esc(r.raku || '（まだ）')}</td>` : `<td>${esc(r.raku || '')}</td>`}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>日</th><th>出し方</th><th>段</th><th>ひとつの数・正解</th><th>楽になったか</th></tr></thead><tbody>${gyou}</tbody></table></div>`;
}

export async function sodateruGamen(el, id) {
  const kid = await getKid(id);
  if (!kid) { el.innerHTML = '<h1>見つかりません</h1><p><a href="#/">はじめの画面へ</a></p>'; return; }
  const kai = kid.kai.filter((r) => r.owari);
  if (!kai.length) {
    el.innerHTML = `<h1>⑥ 育てる（朝の練習）</h1><p>先に ② のゲームを最後までしてから始めます。</p><div class="btns"><a class="btn" href="#/game/${enc(id)}">ゲームへ</a></div>`;
    return;
  }
  const renshu = kid.renshu;
  const cards = await data('cards');
  const pool = await data('renshu');
  const settei = await gakkoSettei();
  const yomiageOK = await junbiYomiage();
  const demoNoKo = isDemo(id);

  // 育てる出し方：見つけたカードから。無いとき（どれでも・ためした）は本人が選ぶ（本人の好み）
  let kouho = sodateKouho(kai);
  let jibun = null;
  if (!kouho) {
    jibun = jibunDeErabu(renshu);
    if (!jibun || demoNoKo) {
      if (demoNoKo && jibun) kouho = [jibun];
      else { erabaseru(); return; }
    } else kouho = [jibun];
  }
  await kyouNoGamen();

  function erabaseru() {
    el.innerHTML = `
      <h1>⑥ 育てる（朝の練習）</h1>
      <p>どの出し方を育ててみますか。好きなものを1つ選んでね。あとで変えることもできます。</p>
      <div class="btns tate">${SODATE_MODES.map((m) => `<button class="choice" data-m="${m}">${esc(SODATE_MEI[m])}</button>`).join('')}</div>
      <div class="btns"><a class="btn sub" href="#/card/${enc(id)}">カードにもどる</a></div>`;
    el.querySelectorAll('.choice').forEach((b) => {
      b.onclick = async () => { jibun = b.dataset.m; kouho = [jibun]; await kyouNoGamen(); };
    });
  }

  async function kyouNoGamen() {
    el.innerHTML = '<h1>⑥ 育てる（朝の練習）</h1><div class="riyuu" aria-live="polite">今日の練習を選んでいます…</div>';
    let r = null;
    try {
      r = await api('sodate', { kouho, jokyou: kouho.map((m) => ({ mode: m, ...danWoDasu(renshu, m), hi: [...new Set(renshu.filter((x) => (x.hitotsu || []).some((h) => h.mode === m)).map((x) => x.hi))].length })) }, 15000);
    } catch { r = null; }
    if (!r || !kouho.includes(r.mode)) {
      const m = yobiKyou(kouho, renshu);
      r = { mode: m, riyuu: kyouNoRiyuu(m, renshu, kouho), dare: 'yobi', wake: 'サーバーにつながらないので、決まった順の予備の動きで選んでいます。' };
    }
    const mode = r.mode;
    const { dan } = danWoDasu(renshu, mode);
    const n = hitotsuNoKazu(settei.朝の練習の長さ);
    const who = r.dare === 'claude' ? 'Claude（AI）が今日の練習を選んだ理由' : r.dare === 'kimari' ? '決まった順' : '決まった順（予備の動き）';
    el.innerHTML = `
      <h1>⑥ 育てる（朝の練習）</h1>
      <p>得意な出し方を支えにして、新しいスイッチを育てる練習です。1つ2〜3分の練習を、${n}つします。</p>
      <div class="riyuu" id="riyuu"><span class="who">${esc(who)}</span>${esc(r.riyuu)}</div>
      ${r.wake ? `<p class="muted small">${esc(r.wake)}</p>` : ''}
      <div class="box soft"><p><strong>今日の練習：${esc(SODATE_MEI[mode])}</strong></p><p>いまの段：${esc(DAN_NO_DASHIKATA[mode][dan - 1])}</p></div>
      ${demoNoKo ? '<p class="muted">架空の子の記録なので、ここでは練習を始めません。</p>' : ''}
      <div class="btns">
        ${demoNoKo ? '' : '<button id="hajimeru">はじめる</button><button class="sub" id="yasumu">今日はやらない</button>'}
        <a class="btn sub" href="#/card/${enc(id)}">カードにもどる</a>
      </div>`;
    if (demoNoKo) return;
    const entry = { no: Date.now(), hi: hiduke(), jibun: jibun || undefined, hitotsu: [], riyuu: r.riyuu, dare: r.dare };
    el.querySelector('#yasumu').onclick = () => {
      saveRenshu(id, { ...entry, yasumi: true });
      el.innerHTML = `<h1>今日はお休み</h1><p>わかりました。今日は練習しません。また別の日にどうぞ。</p><div class="btns"><a class="btn" href="#/card/${enc(id)}">カードを見る</a></div>`;
    };
    el.querySelector('#hajimeru').onclick = () => renshuSuru(mode, n, entry);
  }

  async function renshuSuru(mode, n, entry) {
    const dankai = renshuNoDankai(kai, mode); // 子どもには出さない
    let yameta = false;
    const kiroku = [...renshu];
    for (let i = 0; i < n && !yameta; i++) {
      const { dan } = danWoDasu([...kiroku, entry], mode);
      const p = erabuMondai(pool, mode, dankai, [...kiroku, entry]);
      el.innerHTML = `
        <h1>⑥ 育てる（朝の練習）</h1>
        <p class="muted">${i + 1}つ目／${n}　${esc(SODATE_MEI[mode])}・${esc(DAN_NO_DASHIKATA[mode][dan - 1])}</p>
        <div id="naka"></div>
        <div class="btns"><button class="sub" id="tomeru">ここで止める</button></div>`;
      const tomeruP = new Promise((res) => { el.querySelector('#tomeru').onclick = () => { yameta = true; tomeru(); res(null); }; });
      const k = await Promise.race([hitotsu(mode, dan, p, el.querySelector('#naka'), yomiageOK), tomeruP]);
      if (!k) break;
      entry.hitotsu.push({ mode, dan, mondai: p.id, ...k });
      saveRenshu(id, entry);
      const ato = danWoDasu([...kiroku, entry], mode);
      if (ato.dan > dan) {
        el.innerHTML = `
          <h1>⑥ 育てる（朝の練習）</h1>
          <div class="riyuu"><span class="who">段が進んだ理由（練習の中の事実だけで決めます）</span>${esc(agariNoRiyuu(mode, dan))}</div>
          ${ato.dan >= DAN_JOUGEN ? '<p><strong>カードのレベルが、いちばん上まで進みました。</strong></p>' : ''}
          <div class="btns"><button id="tsugi">次へ</button></div>`;
        await new Promise((res) => { el.querySelector('#tsugi').onclick = res; });
      }
    }
    // 楽になったか（選んで答える。自由入力は無い）
    el.innerHTML = `
      <h1>${yameta ? 'ここで止めました' : 'おつかれさまでした'}</h1>
      <p>今日の練習は、前より楽になりましたか。</p>
      <div class="btns tate">${[...RAKU, KOTAENAI].map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    const raku = await new Promise((res) => el.querySelectorAll('.choice').forEach((b) => { b.onclick = () => res(b.dataset.c); }));
    entry.raku = raku;
    saveRenshu(id, entry);
    const sc = sodateCards([...kiroku, entry]).find((c) => c.card === mode);
    el.innerHTML = `
      <h1>育てているスイッチ</h1>
      ${sc ? cardHtml(sodateCardNoBun(cards, sc), { fukudai: cardNoFukudai(cards, sc), level: sc.level, levelMei: levelNoNamae(cards, sc), jougen: DAN_JOUGEN }) : ''}
      <p class="muted">練習の記録は、あなたのものです。他の人とは比べていません。</p>
      <div class="btns"><a class="btn" href="#/card/${enc(id)}">カードと練習の記録を見る</a></div>`;
  }
}

// ---- 練習のひとつ（2〜3分）。返すもの：{ seikai, kazu, oshita, yomiageNashi }
function hitotsu(mode, dan, p, box, yomiageOK) {
  if (TANA_OF[mode] === 'A') return bunsho(mode, dan, p, box, yomiageOK);
  if (TANA_OF[mode] === 'B') return bamen(mode, dan, p, box);
  return renraku(dan, p, box);
}

// 自分で読む／聞く
function bunsho(mode, dan, p, box, yomiageOK) {
  return new Promise((resolve) => {
    const n = p.本文.length;
    const zenbun = p.本文.join('');
    const zenhan = p.本文.slice(0, Math.ceil(n / 2)).join('');
    const kiku = mode === 'kiku';
    const nashi = !yomiageOK; // 読み上げが使えない端末：文字で出す（段は進めない）
    let oshita = 0;
    let html;
    if (!kiku) {
      const setsumei = ['文章を読み上げます。文を目で追いながら聞いてね。', `はじめの${Math.ceil(n / 2)}文だけ読み上げます。そのあとは、自分で読んでね。`, '自分で読んでね。聞きたいときだけ「聞く」を押してください。', '自分で読んでね。'][dan - 1];
      html = `<p>${esc(setsumei)}</p><div class="honbun">${esc(zenbun)}</div>
        <div class="btns">${dan === 3 && !nashi ? '<button class="sub" id="kiku">▶ 聞く</button>' : ''}${dan <= 2 && !nashi ? '<button class="sub" id="mou">▶ もう一度聞く</button>' : ''}<button id="next">読めた</button></div>`;
    } else {
      const ushiro = Math.floor(n / 2);
      const mieru = dan === 1 ? esc(zenbun) : dan === 2 ? `<span class="muted">（はじめのほうは、聞いてね）</span>${esc(p.本文.slice(ushiro).join(''))}` : '';
      const setsumei = ['文章を読み上げます。文も見ながら聞いてね。', '文章を読み上げます。うしろのほうだけ、文も見えます。', '文章を読み上げます。文を見たいときだけ「文を見る」を押してください。', '文章を読み上げます。よく聞いてね。'][dan - 1];
      html = `<p>${esc(setsumei)}</p>${mieru ? `<div class="honbun">${mieru}</div>` : ''}<div id="mieru-box"></div>
        <div class="btns"><button class="sub" id="mou">▶ もう一度聞く</button>${dan === 3 ? '<button class="sub" id="miru">文を見る</button>' : ''}<button id="next">聞けた</button></div>`;
      if (nashi) html = `<p>（この端末では読み上げが使えないので、文字で出します）</p><div class="honbun">${esc(zenbun)}</div><div class="btns"><button id="next">読めた</button></div>`;
    }
    box.innerHTML = html;
    if (!nashi) {
      if (!kiku && dan === 1) yomu(zenbun);
      if (!kiku && dan === 2) yomu(zenhan);
      if (kiku) yomu(zenbun);
    }
    const on = (sel, fn) => { const b = box.querySelector(sel); if (b) b.onclick = fn; };
    on('#kiku', () => { oshita++; yomu(zenbun); });
    on('#mou', () => yomu(!kiku && dan === 2 ? zenhan : zenbun));
    on('#miru', (e) => { oshita++; box.querySelector('#mieru-box').innerHTML = `<div class="honbun">${esc(zenbun)}</div>`; });
    on('#next', () => { tomeru(); toi(); });
    const kotae = [];
    function toi() {
      const i = kotae.length;
      if (i >= p.問い.length) {
        tomeru();
        resolve({ seikai: kotae.filter((k, j) => k === p.問い[j].答え).length, kazu: p.問い.length, oshita, yomiageNashi: nashi || undefined });
        return;
      }
      const q = p.問い[i];
      const kakusu = kiku && !nashi && dan === 4;
      box.innerHTML = `
        <p class="muted">問い ${i + 1}／${p.問い.length}　本文と合っていますか？</p>
        <div class="toi">${kakusu ? '<span class="kakushi">（この文は読み上げで聞きます）</span>' : esc(q.文)}</div>
        ${kiku && !nashi ? '<div class="btns"><button class="sub" id="again">▶ この文をもう一度聞く</button></div>' : ''}
        <div class="marubatsu"><button data-k="1">合っている</button><button data-k="0">合っていない</button></div>`;
      if ((kiku && !nashi) || (!kiku && dan === 1 && !nashi)) yomu(q.文);
      on('#again', () => yomu(q.文));
      box.querySelectorAll('.marubatsu button').forEach((b) => { b.onclick = () => { tomeru(); kotae.push(b.dataset.k === '1'); toi(); }; });
    }
  });
}

// 文だけで場面をつかむ／図だけで場面をつかむ
function bamen(mode, dan, p, box) {
  return new Promise((resolve) => {
    const kotae = [];
    let kotobaOK;
    const ue = () => {
      if (mode === 'bun') {
        const zu = dan === 1 ? tapeZu(p.図) : dan === 2 ? tapeZu(p.図, { wakuDake: true }) : '';
        return `<div class="honbun">${esc(p.文)}</div>${zu ? `<div class="box">${zu}</div>` : ''}${dan === 3 ? '<div class="box zu-waku" aria-label="図をかく枠"><p class="muted small">ここに図をかくつもりで考えてみよう（ノートや紙にかいてもよい）</p></div>' : ''}`;
      }
      const shita = dan === 1 ? `<div class="honbun">${esc(p.文)}</div>` : dan === 2 ? `<div class="honbun">${esc(p.要点)}</div>` : '';
      return `<div class="box">${tapeZu(p.図)}</div>${shita}`;
    };
    const toi = () => {
      const i = kotae.length;
      if (i >= p.問い.length) {
        resolve({ seikai: kotae.filter((k, j) => k === p.問い[j].答え).length, kazu: p.問い.length, kotobaOK });
        return;
      }
      const t = p.問い[i];
      box.innerHTML = `${ue()}<p class="muted">問い ${i + 1}／${p.問い.length}</p><div class="toi">${esc(t.文)}</div>
        <div class="btns tate">${t.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelectorAll('.choice').forEach((b) => { b.onclick = () => { kotae.push(Number(b.dataset.i)); toi(); }; });
    };
    // 図だけで場面をつかむの段3：はじめに「言葉で言うと？」（選んで答える。数には入れない）
    if (mode === 'zu' && dan === 3) {
      const k = p.言葉にする;
      box.innerHTML = `<div class="box">${tapeZu(p.図)}</div><p><strong>言葉で言うと？</strong></p><div class="toi">${esc(k.文)}</div>
        <div class="btns tate">${k.選択肢.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelectorAll('.choice').forEach((b) => { b.onclick = () => { kotobaOK = Number(b.dataset.i) === k.答え; toi(); }; });
    } else toi();
  });
}

// 連絡をまとめて読む：段1 一文ずつ → 段2 二文ずつ → 段3 全部（番号つき・一文ずつ改行）→ 段4 全部（段落のまま）
function renraku(dan, p, box) {
  return new Promise((resolve) => {
    const n = p.連絡.length;
    const haba = dan === 1 ? 1 : dan === 2 ? 2 : n;
    const kotae = [];
    let mikaeshi = 0;
    const misete = (a, b) => {
      const bun = p.連絡.slice(a, b);
      if (dan === 4) return `<div class="honbun"><p>${esc(p.前おき)}${esc(bun.join(''))}</p></div>`;
      if (dan === 3) return `<div class="honbun"><p>${esc(p.前おき)}</p><ol>${bun.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
      return `<div class="honbun">${a === 0 ? `<p>${esc(p.前おき)}</p>` : ''}${bun.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`;
    };
    const yomaseru = (a) => {
      const b = Math.min(n, a + haba);
      box.innerHTML = `<p class="muted">${haba >= n ? '連絡を全部読んで、読めたら「読めた」を押してください。' : `連絡の ${a + 1}〜${b}文目／${n}：読めたら「読めた」を押してください。`}</p>${misete(a, b)}<div class="btns"><button id="next">読めた</button></div>`;
      box.querySelector('#next').onclick = () => toi(a, b);
    };
    const toi = (a, b) => {
      const i = kotae.length;
      if (i >= p.問い.length) {
        resolve({ seikai: kotae.filter((k, j) => k === p.問い[j].答え).length, kazu: p.問い.length, mikaeshi });
        return;
      }
      if (i >= b) { yomaseru(b); return; }
      const q = p.問い[i];
      box.innerHTML = `<p class="muted">問い ${i + 1}／${p.問い.length}　連絡の中身について</p><div class="toi">${esc(q.文)}</div>
        <div class="btns"><button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>連絡をもう一度見る（1回だけ）</button></div><div id="mikaeshi-box"></div>
        <div class="btns tate">${q.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelector('#mikaesu').onclick = (e) => { mikaeshi++; e.target.disabled = true; box.querySelector('#mikaeshi-box').innerHTML = misete(a, b); };
      box.querySelectorAll('.choice').forEach((bt) => { bt.onclick = () => { kotae.push(Number(bt.dataset.i)); toi(a, b); }; });
    };
    yomaseru(0);
  });
}
