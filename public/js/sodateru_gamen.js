// ⑥ 育てる（朝の練習）の画面。得意な出し方を支えにして、もう一方の出し方を、支えを少しずつ減らしながら練習する。
// 「今日はやらない」を選べる。記録は本人のもの（この端末の中だけ）。子どもの画面に、難しさの段階と「苦手」の言葉は出さない。
import { esc, api, data } from './util.js';
import { getKid, saveRenshu, isDemo, hiduke, claudeNoOboe, claudeWoOboeru, motoNoKey } from './kiroku.js';
import { cardNoFukudai, levelNoNamae } from './kurabe.js';
import {
  sodateKouho, jibunDeErabu, danWoDasu, renshuNoDankai, hitotsuNoKazu, yobiKyou, kyouNoRiyuu, agariNoRiyuu,
  erabuMondai, sodateCards, sodateCardNoBun, SODATE_MODES, SODATE_MEI, DAN_NO_DASHIKATA, DAN_JOUGEN, TANA_OF,
  sawaruTaishou, sawaruNoMasu, sawaruNoKekka,
} from './sodateru.js';
import { gakkoSettei } from './gakko.js';
import { junbiYomiage, yomu, tomeru } from './yomiage.js';
import { bamenZu } from './zu.js';
import { cardHtml } from './card_html.js';

const enc = encodeURIComponent;
export const RAKU = ['前より楽になった', '同じくらい', '難しかった'];
const KOTAENAI = '今は答えない';

// 練習の記録（本人の画面・先生の画面で同じ並び）
export function renshuKirokuHtml(renshu, { sensei = false } = {}) {
  if (!renshu.length) return '<p class="muted">まだ練習していません。</p>';
  const gyou = renshu.map((r) => {
    if (r.yasumi) return `<tr><td>${esc(r.hi)}</td><td colspan="4">今日はやらない、を選んだ</td></tr>`;
    const hs = r.hitotsu || [];
    if (!hs.length) return `<tr><td>${esc(r.hi)}</td><td colspan="4">始めたところで止めた</td></tr>`;
    const mode = hs[0].mode;
    const dans = [...new Set(hs.map((h) => h.dan))];
    const seikai = hs.reduce((s, h) => s + h.seikai, 0);
    const kazu = hs.reduce((s, h) => s + h.kazu, 0);
    const oshita = hs.filter((h) => h.dan === 3 && (mode === 'yomu' || mode === 'kiku')).map((h) => h.oshita ?? 0);
    const sawaru = hs.filter((h) => h.sawaru);
    const sawaruBun = sensei && sawaru.length ? `・図を触る ${sawaru.length}回（直した回数 ${sawaru.map((h) => h.sawaru.naoshi).join('・')}）` : '';
    return `<tr><td>${esc(r.hi)}</td><td>${esc(SODATE_MEI[mode])}${r.jibun && sensei ? '（本人が選んだ）' : ''}</td><td>${dans.map((d) => esc(DAN_NO_DASHIKATA[mode][d - 1])).join(' → ')}</td><td>${hs.length}つ・正解 ${seikai}／${kazu}${sensei && oshita.length ? `・押した回数 ${oshita.join('・')}` : ''}${sawaruBun}</td>${sensei ? `<td>${esc(r.raku || '（まだ）')}</td>` : `<td>${esc(r.raku || '')}</td>`}</tr>`;
  }).join('');
  // 12便 P2：子どもの画面では「段」と言わず「やり方」（段階と区別がつかないため）。先生の画面は「段」のまま
  return `<div class="table-wrap"><table><thead><tr><th>日</th><th>出し方</th><th>${sensei ? '段' : 'やり方'}</th><th>ひとつの数・正解</th><th>楽になったか</th></tr></thead><tbody>${gyou}</tbody></table></div>`;
}

export async function sodateruGamen(el, id) {
  const kid = await getKid(id);
  if (!kid) { el.innerHTML = '<h1>見つかりません</h1><p><a href="#/">はじめの画面へ</a></p>'; return; }
  const kai = kid.kai.filter((r) => r.owari);
  if (!kai.length) {
    el.innerHTML = `<h1>朝の練習</h1><p>先に ② のゲームを してね。</p><div class="btns"><a class="btn" href="#/game/${enc(id)}">ゲームへ</a></div>`;
    return;
  }
  const renshu = kid.renshu;
  const cards = await data('cards');
  const pool = await data('renshu');
  const settei = await gakkoSettei();
  let should = {};
  try { should = await data('should'); } catch { should = {}; }
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
      <h1>朝の練習</h1>
      <p>どれを 育てる？（あとで 変えられる）</p>
      <div class="btns tate">${SODATE_MODES.map((m) => `<button class="choice" data-m="${m}">${esc(SODATE_MEI[m])}</button>`).join('')}</div>
      <p class="small"><a href="#/card/${enc(id)}">カードに戻る</a></p>`;
    el.querySelectorAll('.choice').forEach((b) => {
      b.onclick = async () => { jibun = b.dataset.m; kouho = [jibun]; await kyouNoGamen(); };
    });
  }

  async function kyouNoGamen() {
    el.innerHTML = '<h1>朝の練習</h1><p class="muted" aria-live="polite">選んでいます…</p>';
    // 10便 M2：Claude が選んだ理由は端末に覚える。練習の記録か候補が変わったときだけ呼び直す（予備の文は覚えない）
    const key = motoNoKey({ renshu, hoka: kouho });
    let r = claudeNoOboe(id, 'sodate', key);
    if (!r) {
      try {
        r = claudeWoOboeru(id, 'sodate', key, await api('sodate', { kouho, jokyou: kouho.map((m) => ({ mode: m, ...danWoDasu(renshu, m), hi: [...new Set(renshu.filter((x) => (x.hitotsu || []).some((h) => h.mode === m)).map((x) => x.hi))].length })) }, 15000));
      } catch { r = null; }
    }
    if (!r || !kouho.includes(r.mode)) {
      const m = yobiKyou(kouho, renshu);
      r = { mode: m, riyuu: kyouNoRiyuu(m, renshu), dare: 'yobi' };
    }
    const mode = r.mode;
    const { dan } = danWoDasu(renshu, mode);
    const n = hitotsuNoKazu(settei.朝の練習の長さ);
    // 12便 P1：子どもの画面には「予備の動き」「決まった順」を出さない。AI が選んだときだけ、そのことを出す
    const who = r.dare === 'claude' ? 'AI（Claude）が 選んだ理由' : '';
    // 12便 P2：「いまの段」→「きょうの やり方」（段階と区別がつかないため、子どもの画面では「段」と言わない）
    el.innerHTML = `
      <h1>朝の練習</h1>
      <div class="box soft"><p><strong>今日の練習：${esc(SODATE_MEI[mode])}</strong></p><p>今日の やり方：<span data-kazoenai>${esc(DAN_NO_DASHIKATA[mode][dan - 1])}</span></p><p>1つ 2〜3分。${n}つ します。</p></div>
      <div class="riyuu" id="riyuu">${who ? `<span class="who">${esc(who)}</span>` : ''}${esc(r.riyuu)}</div>
      ${demoNoKo ? '<p class="muted">架空の子なので 始めません。</p>' : ''}
      <div class="btns">
        ${demoNoKo ? '' : '<button id="hajimeru">始める</button><button class="sub" id="yasumu">今日はやらない</button>'}
      </div>
      <p class="small"><a href="#/card/${enc(id)}">カードに戻る</a></p>`;
    if (demoNoKo) return;
    const entry = { no: Date.now(), hi: hiduke(), jibun: jibun || undefined, hitotsu: [], riyuu: r.riyuu, dare: r.dare };
    el.querySelector('#yasumu').onclick = () => {
      saveRenshu(id, { ...entry, yasumi: true });
      el.innerHTML = `<h1>今日は お休み。</h1><p>また 別の日に。</p><div class="btns"><a class="btn" href="#/card/${enc(id)}">カードを見る</a></div>`;
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
        <div class="progress-wrap"><div class="progress" aria-hidden="true"><div style="width:${Math.round((i / n) * 100)}%"></div></div><span class="progress-kazu">${i + 1}／${n}</span></div>
        <p class="tsugi-ichibun">${esc(SODATE_MEI[mode])}：<span data-kazoenai>${esc(DAN_NO_DASHIKATA[mode][dan - 1])}</span></p>
        <div id="naka"></div>
        <div class="tomeru-waku"><button class="tomeru-chiisai" id="tomeru">止める</button></div>`;
      const tomeruP = new Promise((res) => { el.querySelector('#tomeru').onclick = () => { yameta = true; tomeru(); res(null); }; });
      // 12便 P4（Should）：文・図の練習の段1〜2で、問いの前に「置いてみよう」（図を触る）。正解の数には入れない
      let sawaru;
      if (should.zuWoSawaru?.使う && sawaruTaishou(mode, dan, p.図)) {
        sawaru = await Promise.race([sawaruGamen(p, el.querySelector('#naka')), tomeruP]);
        if (!sawaru) break;
      }
      const k = await Promise.race([hitotsu(mode, dan, p, el.querySelector('#naka'), yomiageOK), tomeruP]);
      if (!k) break;
      entry.hitotsu.push({ mode, dan, mondai: p.id, ...k, ...(sawaru ? { sawaru } : {}) });
      saveRenshu(id, entry);
      const ato = danWoDasu([...kiroku, entry], mode);
      if (ato.dan > dan) {
        // 12便 P2：「段が進んだ理由」→「つぎの やり方に なった理由」
        el.innerHTML = `
          <h1>次の やり方に 進んだ わけ</h1>
          <div class="riyuu">${esc(agariNoRiyuu())}</div>
          <p>次の やり方：<span data-kazoenai>${esc(DAN_NO_DASHIKATA[mode][dan])}</span></p>
          ${ato.dan >= DAN_JOUGEN ? '<p><strong>カードが 一人前に なったよ！</strong></p>' : ''}
          <div class="btns"><button id="tsugi">次へ</button></div>`;
        await new Promise((res) => { el.querySelector('#tsugi').onclick = res; });
      }
    }
    // 楽になったか（選んで答える。自由入力は無い）
    el.innerHTML = `
      <h1>${yameta ? '止めました' : 'おつかれさま！'}</h1>
      <p>前より 楽に なった？</p>
      <div class="btns tate">${[...RAKU, KOTAENAI].map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    const raku = await new Promise((res) => el.querySelectorAll('.choice').forEach((b) => { b.onclick = () => res(b.dataset.c); }));
    entry.raku = raku;
    saveRenshu(id, entry);
    const sc = sodateCards([...kiroku, entry]).find((c) => c.card === mode);
    el.innerHTML = `
      <h1>育てているカード</h1>
      ${sc ? cardHtml(sodateCardNoBun(cards, sc), { fukudai: cardNoFukudai(cards, sc), level: sc.level, levelMei: levelNoNamae(cards, sc), jougen: DAN_JOUGEN, sodate: true }) : ''}
      <p class="muted">記録は あなたのもの。</p>
      <div class="btns"><a class="btn" href="#/card/${enc(id)}">カードを見る</a></div>`;
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
      const setsumei = ['読み上げを 聞きながら 読もう。', '始めだけ 読み上げるよ。', '聞きたいときだけ ▶。', '自分で 読もう。'][dan - 1];
      html = `<p>${esc(setsumei)}</p><div class="honbun">${esc(zenbun)}</div>
        <div class="btns">${dan === 3 && !nashi ? '<button class="sub" id="kiku">▶ 聞く</button>' : ''}${dan <= 2 && !nashi ? '<button class="sub" id="mou">▶ もう一度</button>' : ''}<button id="next">次へ</button></div>`;
    } else {
      const ushiro = Math.floor(n / 2);
      const mieru = dan === 1 ? esc(zenbun) : dan === 2 ? `<span class="muted">（始めは 聞いてね）</span>${esc(p.本文.slice(ushiro).join(''))}` : '';
      const setsumei = ['文を 見ながら 聞こう。', '後ろだけ 文が 見えるよ。', '見たいときだけ「文を 見る」。', 'よく 聞こう。'][dan - 1];
      html = `<p>${esc(setsumei)}</p>${mieru ? `<div class="honbun">${mieru}</div>` : ''}<div id="mieru-box"></div>
        <div class="btns"><button class="sub" id="mou">▶ もう一度</button>${dan === 3 ? '<button class="sub" id="miru">文を 見る</button>' : ''}<button id="next">次へ</button></div>`;
      if (nashi) html = `<p class="muted small">（文字で出します）</p><div class="honbun">${esc(zenbun)}</div><div class="btns"><button id="next">次へ</button></div>`;
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
        <p class="toi-mae">${i + 1}／${p.問い.length}　合ってる？</p>
        <div class="toi">${kakusu ? '<span class="kakushi">（聞いてね）</span>' : esc(q.文)}</div>
        ${kiku && !nashi ? '<div class="btns"><button class="sub" id="again">▶ この文をもう一度聞く</button></div>' : ''}
        <div class="marubatsu"><button data-k="1" class="maru"><span aria-hidden="true">○</span> 合う</button><button data-k="0" class="batsu"><span aria-hidden="true">×</span> 違う</button></div>`;
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
        const zu = dan === 1 ? bamenZu(p.図) : dan === 2 ? bamenZu(p.図, { wakuDake: true }) : '';
        return `<p class="bamen-dai">${esc(p.題 || '')}</p><div class="honbun">${esc(p.文)}</div>${zu ? `<div class="box">${zu}</div>` : ''}${dan === 3 ? '<div class="box zu-waku" aria-label="図をかく枠"><p class="muted small">ここに 図を 描く つもりで（紙に 描いても いい）</p></div>' : ''}`;
      }
      const shita = dan === 1 ? `<div class="honbun">${esc(p.文)}</div>` : dan === 2 ? `<div class="honbun">${esc(p.要点)}</div>` : '';
      return `<p class="bamen-dai">${esc(p.題 || '')}</p><div class="box">${bamenZu(p.図)}</div>${shita}`;
    };
    const toi = () => {
      const i = kotae.length;
      if (i >= p.問い.length) {
        resolve({ seikai: kotae.filter((k, j) => k === p.問い[j].答え).length, kazu: p.問い.length, kotobaOK });
        return;
      }
      const t = p.問い[i];
      box.innerHTML = `${ue()}<p class="toi-mae">${i + 1}／${p.問い.length}</p><div class="toi">${esc(t.文)}</div>
        <div class="btns tate">${t.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelectorAll('.choice').forEach((b) => { b.onclick = () => { kotae.push(Number(b.dataset.i)); toi(); }; });
    };
    // 図だけで場面をつかむの段3：はじめに「言葉で言うと？」（選んで答える。数には入れない）
    if (mode === 'zu' && dan === 3) {
      const k = p.言葉にする;
      box.innerHTML = `<p class="bamen-dai">${esc(p.題 || '')}</p><div class="box">${bamenZu(p.図)}</div><p><strong>言葉で言うと？</strong></p><div class="toi">${esc(k.文)}</div>
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
      box.innerHTML = `${haba >= n ? '' : `<p class="toi-mae">${a + 1}〜${b}／${n}</p>`}${misete(a, b)}<div class="btns"><button id="next">次へ</button></div>`;
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
      box.innerHTML = `<p class="toi-mae">${i + 1}／${p.問い.length}</p><div class="toi">${esc(q.文)}</div>
        <div class="btns"><button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>もう一度 見る（あと1回）</button></div><div id="mikaeshi-box"></div>
        <div class="btns tate">${q.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelector('#mikaesu').onclick = (e) => { mikaeshi++; e.target.disabled = true; box.querySelector('#mikaeshi-box').innerHTML = misete(a, b); };
      box.querySelectorAll('.choice').forEach((bt) => { bt.onclick = () => { kotae.push(Number(bt.dataset.i)); toi(a, b); }; });
    };
    yomaseru(0);
  });
}

// ---- 12便 P4（Should）：図を触る。文を読んで、名前や物の札を、図の枠にタップで置く（ドラッグは使わない）。
// 札を選んで → 枠を押すと置く。置いた枠を押すと札がもどる。「もどす」で、最後に置いたものをもどす。直した回数を数える
function sawaruGamen(p, box) {
  return new Promise((resolve) => {
    const m = sawaruNoMasu(p.図);
    const fuda = m.masu.filter((x) => x.kotae != null).map((x) => x.kotae).sort((a, b) => a.localeCompare(b, 'ja'));
    const okareta = {};
    const rireki = [];
    let erabi = null;
    let naoshi = 0;
    const masu = (i, j) => m.masu.find((x) => x.i === i && x.j === j);
    const kaku = () => {
      const oita = Object.values(okareta);
      const nokori = fuda.filter((f) => !oita.includes(f));
      const mae = p.図.type === 'seki' ? `<div class="sawaru-mae" style="grid-column: 1 / span ${m.cols}">${esc(p.図.mae || '黒板')}（前）</div>` : '';
      const cells = [];
      for (let i = 0; i < m.rows; i++) {
        for (let j = 0; j < m.cols; j++) {
          const x = masu(i, j);
          if (!x) cells.push('<div></div>');
          else if (x.kotae == null) cells.push('<div class="sawaru-aki" data-kazoenai>空き</div>');
          else cells.push(`<button class="sawaru-masu${okareta[`${i}-${j}`] ? ' oita' : ''}" data-k="${i}-${j}" aria-label="${p.図.type === 'tana' ? `上から${i + 1}つめの たな` : `前から${i + 1}列め`}・左から${j + 1}番め" data-kazoenai>${esc(okareta[`${i}-${j}`] || '')}</button>`);
        }
      }
      box.innerHTML = `
        <p class="tsugi-ichibun">置いてみよう</p>
        <p class="bamen-dai">${esc(p.題 || '')}</p>
        <div class="honbun">${esc(p.文)}</div>
        <div class="sawaru-zu" style="grid-template-columns: repeat(${m.cols}, 1fr)">${mae}${cells.join('')}</div>
        <div class="sawaru-fuda">${nokori.map((f) => `<button class="fuda${erabi === f ? ' erabi' : ''}" data-f="${esc(f)}" aria-pressed="${erabi === f}" data-kazoenai>${esc(f)}</button>`).join('')}</div>
        <div class="btns"><button class="sub" id="modosu" ${rireki.length ? '' : 'disabled'}>戻す</button><button id="dekita" ${nokori.length ? 'disabled' : ''}>できた</button></div>`;
      box.querySelectorAll('.fuda').forEach((b) => { b.onclick = () => { erabi = erabi === b.dataset.f ? null : b.dataset.f; kaku(); }; });
      box.querySelectorAll('.sawaru-masu').forEach((b) => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (erabi) {
            if (okareta[k]) naoshi++; // 置いてあった札がもどる（置き直し）
            okareta[k] = erabi;
            rireki.push(k);
            erabi = null;
          } else if (okareta[k]) {
            delete okareta[k]; // 置いた札をもどす
            naoshi++;
          }
          kaku();
        };
      });
      box.querySelector('#modosu').onclick = () => {
        const k = rireki.pop();
        if (k && okareta[k]) { delete okareta[k]; naoshi++; }
        kaku();
      };
      box.querySelector('#dekita').onclick = () => resolve(sawaruNoKekka(p.図, okareta, naoshi));
    };
    kaku();
  });
}

