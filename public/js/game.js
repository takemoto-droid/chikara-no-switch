// ② ゲーム。Claude が次の問題を選び、その理由を画面に出す。途中で止めて、続きから始められる。
import { esc, api, data, okuruKiroku, whoLabel } from './util.js';
import { getRecord, saveRecord, isDemo } from './kiroku.js';
import { kouho, owatta, yobiNext, yobiRiyuu, stepOf, DASHIKATA, zenbuOf, dankaiWoSusumeru } from './kurabe.js';
import { junbiYomiage, yomu, tomeru, koeNoNamae } from './yomiage.js';
import { tapeZu } from './zu.js';
import { gakkoSettei } from './gakko.js';


export async function gameScreen(el, id) {
  const tana = await data('tana');
  let rec = await getRecord(id);
  if (!rec) {
    el.innerHTML = `<h1>見つかりません</h1><p>この端末には、この記録がありません。</p><p><a href="#/hajimeru">はじめから動かす</a></p>`;
    return;
  }
  if (isDemo(id)) {
    el.innerHTML = `<h1>${esc(id)} の結果は保存してあります</h1><p>架空の子の、保存した結果です。</p><div class="btns"><a class="btn" href="#/card/${encodeURIComponent(id)}">スイッチカードを見る</a></div>`;
    return;
  }
  const yomiageOK = await junbiYomiage();
  let yameta = false;

  // 12便 P1：子どもの画面の文字を減らす。進み具合は数字も出す。「止める」は下に小さく1つ
  const frame = () => {
    const n = Object.keys(rec.kekka).length;
    const zen = zenbuOf(rec);
    el.innerHTML = `
      <div class="progress-wrap"><div class="progress" aria-hidden="true"><div style="width:${Math.round((n / zen) * 100)}%"></div></div><span class="progress-kazu" aria-label="${n + 1}問目／${zen}問">${Math.min(n + 1, zen)}／${zen}</span></div>
      <div id="game-naka"></div>
      ${yomiageOK ? '' : '<p class="muted small">この端末は読み上げが使えません。</p>'}
      <div class="tomeru-waku"><button class="tomeru-chiisai" id="tomeru">止める</button></div>`;
    el.querySelector('#tomeru').onclick = () => {
      yameta = true;
      tomeru();
      saveRecord(rec);
      hakaru(false);
      el.innerHTML = `<h1>止めました</h1><p>つづきは、あとで できます。</p>
        <div class="btns"><a class="btn" href="#/game/${encodeURIComponent(rec.id)}">つづきから</a><a class="btn sub" href="#/">はじめの画面</a></div>`;
    };
    return el.querySelector('#game-naka');
  };

  const owariGamen = () => {
    rec.owari = true;
    rec.owariJi = Date.now();
    saveRecord(rec);
    hakaru(false);
    el.innerHTML = `<h1>おつかれさま！</h1><p>${rec.shurui === 'mijikai' ? 'カードを見てみよう。もらったカードは、なくならないよ。' : 'あなたのカードが できたよ。'}</p>
      <div class="btns"><a class="btn" href="#/card/${encodeURIComponent(rec.id)}">カードを見る</a></div>`;
  };

  // 長い HR の途中の休み（7便）：半分まで進んだところで1回だけ。学校の設定の HR が45分以上のとき（12便 P2 で短く）
  const settei = await gakkoSettei();
  const yasumiGamen = () => new Promise((res) => {
    hakaru(false);
    el.innerHTML = `<h1>はんぶん きた！</h1><p class="nobi" aria-hidden="true">🙆</p><p>のびを してから。</p>
      <div class="btns"><button id="tsuzukeru">つづける</button></div>
      <div class="tomeru-waku"><button class="tomeru-chiisai" id="tomeru2">止める</button></div>`;
    el.querySelector('#tsuzukeru').onclick = () => res(true);
    el.querySelector('#tomeru2').onclick = () => { yameta = true; saveRecord(rec); location.hash = '#/'; res(false); };
  });

  const tsugi = async () => {
    if (yameta) return;
    if (owatta(rec)) { owariGamen(); return; }
    if (rec.shurui !== 'mijikai' && settei.HRの長さ >= 45 && !rec.yasunda && Object.keys(rec.kekka).length >= Math.floor(zenbuOf(rec) / 2)) {
      rec.yasunda = true;
      saveRecord(rec);
      if (!(await yasumiGamen())) return;
    }
    const naka = frame();
    naka.innerHTML = '<p class="muted" aria-live="polite">つぎを えらんでいます…</p>';
    let r;
    try {
      r = await api('tsugi', { record: okuruKiroku(rec) }, 15000);
    } catch {
      r = null;
    }
    if (yameta) return;
    if (!r || !kouho(rec).includes(r.next)) {
      const nid = yobiNext(rec);
      r = { next: nid, riyuu: yobiRiyuu(rec, nid), dare: 'yobi' };
    }
    // 組の途中で問題を変えたときは、子どもには「新しい問題」とだけ言う（段階は言わない）
    let atarashii = false;
    if (rec.atarashiiBunsho) {
      r = { ...r, riyuu: `ここから、新しい問題で比べなおします。${r.riyuu}` };
      rec.atarashiiBunsho = false;
      atarashii = true;
    }
    const st = stepOf(rec, r.next);
    // 12便 P1：理由の画面と「はじめる」の一手をやめ、問題の上に一文＋絵印だけを出す。
    // Claude の理由の全文は記録（erabi）に残し、先生の画面の「次を選んだ理由の記録」で見る
    naka.innerHTML = `<p class="tsugi-ichibun" id="riyuu" data-step="${esc(st.id)}">${esc(tsugiNoIchibun(st, atarashii))}</p><div id="mondai"></div>`;
    hakaru(st.kind !== 'D');
    const kekka = await jikko(st, tana, naka.querySelector('#mondai'), yomiageOK);
    if (yameta) return;
    rec.kekka[st.id] = kekka;
    rec.erabi = [...(rec.erabi || []), { step: st.id, riyuu: r.riyuu, dare: r.dare }];
    // 段階を選ぶ・切りかえる（7便）。子どもの画面には段階を出さない。変えたことは先生の画面に事実で出す
    const henka = dankaiWoSusumeru(rec);
    if (henka.some((h) => h.kind !== 'all')) rec.atarashiiBunsho = true;
    saveRecord(rec);
    tsugi();
  };
  tsugi();
}

// 測っている問題のあいだ（読む／聞く・文／図・一気に／区切って）は、右上の読み上げ ▶ が本文や問いを読まないようにする（比べがこわれないように）
function hakaru(on) {
  if (on) document.body.dataset.hakaru = '1';
  else delete document.body.dataset.hakaru;
}

// 問題の上の一文（12便 P1）。絵印＋短い言葉。
const EJIRUSHI = { yomu: '📖 読む', kiku: '👂 聞く', bun: '📝 文で見る', zu: '🗺️ 図で見る', ikki: '📄 まとめて読む', kugiri: '✂️ 一文ずつ読む' };
export function tsugiNoIchibun(st, atarashii = false) {
  if (st.kind === 'D') return 'つぎは 質問 💬';
  const e = EJIRUSHI[st.mode] || '';
  if (st.renshu) return `つぎは 練習（${e}）`;
  return atarashii ? `つぎは 新しい問題（${e}）` : `つぎは ${e}`;
}

// 練習問題を Claude が作る（Should・5便）：キーがあり、should.json で使うときだけ。練習は比べる数に入れない
let settei = { ai: false, renshu: false };
export function setSettei(s) { settei = { ...settei, ...s }; }

async function renshuNoMondai(st) {
  if (!st.renshu || !settei.ai || !settei.renshu) return null;
  try {
    const r = await api('renshu', { mode: st.mode, n: st.id === 'A-r2' ? 2 : 1 }, 20000);
    return r.dare === 'claude' && r.mondai ? r.mondai : null;
  } catch {
    return null;
  }
}

async function jikko(st, tana, box, yomiageOK) {
  if (st.kind === 'A') {
    const tsukutta = await renshuNoMondai(st);
    const k = await bunshoMondai(st, tana, box, yomiageOK, tsukutta);
    return tsukutta ? { ...k, renshuDare: 'claude' } : k;
  }
  if (st.kind === 'C') return shijiMondai(st, tana, box);
  if (st.kind === 'B') return bamenMondai(st, tana, box);
  return shitsumon(st, tana, box, yomiageOK);
}

// 読む／聞くの問題
function bunshoMondai(st, tana, box, yomiageOK, tsukutta = null) {
  return new Promise((resolve) => {
    const p = tsukutta || tana.A.文章[st.mondai];
    const tsukuttaLabel = tsukutta ? '<p><span class="label ai">AI（Claude）が作った練習</span></p>' : '';
    const zenbun = p.本文.join('');
    const kiku = st.mode === 'kiku' && yomiageOK;
    const yomiageNashi = st.mode === 'kiku' && !yomiageOK;
    const honbunHtml = esc(zenbun);
    let mikaeshi = 0;
    let kikuKaisu = 0;

    // 1：本文
    if (kiku) {
      box.innerHTML = `${tsukuttaLabel}
        <div class="btns"><button id="play" class="sub">▶ 聞く</button><button id="next" disabled>つぎへ</button></div>`;
      box.querySelector('#play').onclick = async () => {
        kikuKaisu++;
        box.querySelector('#play').disabled = true;
        await yomu(zenbun);
        box.querySelector('#play').disabled = false;
        box.querySelector('#next').disabled = false;
      };
      box.querySelector('#next').onclick = () => toi();
    } else {
      box.innerHTML = `${tsukuttaLabel}${yomiageNashi ? '<p class="muted small">（文字で出します）</p>' : ''}
        <div class="honbun">${honbunHtml}</div>
        <div class="btns"><button id="next">つぎへ</button></div>`;
      box.querySelector('#next').onclick = () => toi();
    }

    // 2：問い（1つずつ）
    const kotae = [];
    let t0 = 0;
    function toi() {
      if (!t0) t0 = performance.now();
      const i = kotae.length;
      if (i >= p.問い.length) {
        tomeru();
        const seikai = kotae.filter((k, j) => k === p.問い[j].答え).length;
        resolve({ seikai, kazu: p.問い.length, ms: Math.round(performance.now() - t0), mikaeshi, kikuKaisu, kotae, koe: st.mode === 'kiku' ? koeNoNamae() : undefined, yomiageNashi: yomiageNashi || undefined });
        return;
      }
      const q = p.問い[i];
      box.innerHTML = `
        <p class="toi-mae">${i + 1}／${p.問い.length}　合ってる？</p>
        <div class="toi">${kiku ? '<span class="kakushi">（聞いてね）</span>' : esc(q.文)}</div>
        <div class="btns">
          ${kiku ? '<button class="sub" id="again">▶ もう一度</button>' : ''}
          <button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>${kiku ? 'もう一度 聞く（あと1回）' : 'もう一度 見る（あと1回）'}</button>
        </div>
        <div id="mikaeshi-box"></div>
        <div class="marubatsu"><button data-k="1" class="maru"><span aria-hidden="true">○</span> 合う</button><button data-k="0" class="batsu"><span aria-hidden="true">×</span> ちがう</button></div>`;
      if (kiku) {
        yomu(q.文);
        box.querySelector('#again').onclick = () => yomu(q.文);
      }
      box.querySelector('#mikaesu').onclick = (e) => {
        mikaeshi++;
        e.target.disabled = true;
        if (kiku) yomu(zenbun);
        else box.querySelector('#mikaeshi-box').innerHTML = `<div class="honbun">${honbunHtml}</div>`;
      };
      box.querySelectorAll('.marubatsu button').forEach((b) => {
        b.onclick = () => { tomeru(); kotae.push(b.dataset.k === '1'); toi(); };
      });
    }
  });
}

// 場面の問題（図あり／文だけ）。1つの場面に問いが2つ
function bamenMondai(st, tana, box) {
  return new Promise((resolve) => {
    const q = tana.B.問題[st.mondai];
    const t0 = performance.now();
    const kotae = [];
    const toi = () => {
      const i = kotae.length;
      if (i >= q.問い.length) {
        const seikai = kotae.filter((k, j) => k === q.問い[j].答え).length;
        resolve({ seikai, kazu: q.問い.length, ms: Math.round(performance.now() - t0), kotae: kotae.map((k, j) => q.問い[j].選択肢[k]) });
        return;
      }
      const t = q.問い[i];
      box.innerHTML = `
        <div class="honbun">${esc(q.文)}</div>
        ${st.mode === 'zu' ? `<div class="box">${tapeZu(q.図)}</div>` : ''}
        <p class="toi-mae">${i + 1}／${q.問い.length}</p>
        <div class="toi">${esc(t.文)}</div>
        <div class="btns tate">${t.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelectorAll('.choice').forEach((b) => {
        b.onclick = () => { b.blur(); kotae.push(Number(b.dataset.i)); toi(); };
      });
    };
    toi();
  });
}

// 一気に／区切って：行事や授業の連絡（4つの文）を読んで、連絡の中身を答える（5便で作り直し）
// 一気に：4つの文をまとめて読んでから、問い1〜4に答える
// 区切って：一文ずつ読み、1つ読むごとにその文の問いに答える
// どちらも、問いに答えるときは連絡は見えない。見返しは1回まで
function shijiMondai(st, tana, box) {
  return new Promise((resolve) => {
    const p = tana.C.文章[st.mondai];
    const ikki = st.mode === 'ikki';
    const kotae = [];
    let mikaeshi = 0;
    const t0 = performance.now(); // 時間は、読み始めから最後の答えまで（どちらの出し方も同じ数え方）
    const shijiHtml = (upto) => `<div class="honbun"><p>${esc(p.前おき)}</p><ol>${p.連絡.slice(0, upto).map((x, i) => (ikki || i === upto - 1 ? `<li>${esc(x)}</li>` : '')).join('')}</ol></div>`;
    const yomu = (i) => {
      // 一気に：はじめに全部。区切って：i 番目の文だけ
      const upto = ikki ? p.連絡.length : i + 1;
      box.innerHTML = `
        ${ikki ? '' : `<p class="toi-mae">${i + 1}／${p.連絡.length}</p>`}
        ${ikki ? shijiHtml(upto) : `<div class="honbun">${i === 0 ? `<p>${esc(p.前おき)}</p>` : ''}<p>${esc(p.連絡[i])}</p></div>`}
        <div class="btns"><button id="next">つぎへ</button></div>`;
      box.querySelector('#next').onclick = () => toi(i);
    };
    const toi = (i) => {
      if (i >= p.問い.length) {
        const seikai = kotae.filter((k, j) => k === p.問い[j].答え).length;
        resolve({ seikai, kazu: p.問い.length, ms: Math.round(performance.now() - t0), mikaeshi, kotae: kotae.map((k, j) => p.問い[j].選択肢[k]) });
        return;
      }
      const q = p.問い[i];
      box.innerHTML = `
        <p class="toi-mae">${i + 1}／${p.問い.length}</p>
        <div class="toi">${esc(q.文)}</div>
        <div class="btns"><button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>もう一度 見る（あと1回）</button></div>
        <div id="mikaeshi-box"></div>
        <div class="btns tate">${q.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelector('#mikaesu').onclick = (e) => {
        mikaeshi++;
        e.target.disabled = true;
        box.querySelector('#mikaeshi-box').innerHTML = ikki ? shijiHtml(p.連絡.length) : `<div class="honbun"><p>${esc(p.連絡[i])}</p></div>`;
      };
      box.querySelectorAll('.choice').forEach((b) => {
        b.onclick = () => {
          b.blur();
          kotae.push(Number(b.dataset.i));
          if (ikki) toi(i + 1);
          else if (i + 1 < p.連絡.length) yomu(i + 1);
          else toi(i + 1);
        };
      });
    };
    yomu(0);
  });
}

// 選んで答える質問（自由入力は無い）
function shitsumon(st, tana, box, yomiageOK) {
  return new Promise((resolve) => {
    const q = tana.D.質問[st.mondai];
    const sentaku = [...q.選択肢, tana.D.答えない];
    box.innerHTML = `
      <div class="toi">${esc(q.問い)}</div>
      ${yomiageOK ? '<div class="btns"><button class="sub" id="yomu">▶ 聞く</button></div>' : ''}
      <div class="btns tate">${sentaku.map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    if (yomiageOK) {
      const y = () => yomu(`${q.問い}。${q.選択肢.join('。')}。`);
      box.querySelector('#yomu').onclick = y;
    }
    box.querySelectorAll('.choice').forEach((b) => {
      b.onclick = () => { tomeru(); resolve({ kotae: b.dataset.c }); };
    });
  });
}

export { DASHIKATA };
