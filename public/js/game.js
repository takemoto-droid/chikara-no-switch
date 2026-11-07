// ② ゲーム。Claude が次の問題を選び、その理由を画面に出す。途中で止めて、続きから始められる。
import { esc, api, data, okuruKiroku, whoLabel } from './util.js';
import { getRecord, saveRecord, isDemo, namaeOf, isTaiken } from './kiroku.js';
import { kouho, owatta, yobiNext, yobiRiyuu, stepOf, DASHIKATA, zenbuOf, dankaiWoSusumeru } from './kurabe.js';
import { junbiYomiage, yomu, tomeru, koeNoNamae } from './yomiage.js';
import { bamenZu } from './zu.js';
import { gakkoSettei } from './gakko.js';


// いま画面を持っているゲームの番号。別の画面へ移ったり、別のゲームを開いたりしたら増える（前のゲームの続きが、いまの画面に描かないように）
let imaNoGame = 0;
export function gameWoHanareru() { imaNoGame++; }

export async function gameScreen(el, id) {
  const kono = ++imaNoGame;
  const tana = await data('tana');
  let rec = await getRecord(id);
  if (!rec) {
    el.innerHTML = `<h1>見つかりません</h1><p>この端末には、この記録がありません。</p><p><a href="#/hajimeru">始めから動かす</a></p>`;
    return;
  }
  if (isDemo(id)) {
    el.innerHTML = `<h1>${esc(await namaeOf(id))} の結果は保存してあります</h1><p>架空の子の、保存した結果です。</p><div class="btns"><a class="btn" href="#/card/${encodeURIComponent(id)}">スイッチカードを見る</a></div>`;
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
      <div class="tomeru-waku"><button class="tomeru-chiisai" id="tomeru">ひと休み</button></div>`;
    el.querySelector('#tomeru').onclick = hitoyasumi;
    return el.querySelector('#game-naka');
  };
  // 13便のもと（先生の決定）：「止める」は無くし「ひと休み」にまとめる。押すと止まり、後で続きから始められる
  const hitoyasumi = () => {
    yameta = true;
    tomeru();
    saveRecord(rec);
    hakaru(false);
    el.innerHTML = `<h1>ひと休み中</h1><p>続きは、後で できます。</p>
        <div class="btns"><a class="btn" id="tsuzukikara" href="#/game/${encodeURIComponent(rec.id)}">続きから</a><a class="btn sub" href="#/">はじめの画面</a></div>`;
    // 21便 U1：いまのアドレスと同じなので、アドレスは変えずに、その場でゲームの画面を描き直す（はじめの画面から再開したときと同じ）
    el.querySelector('#tsuzukikara').onclick = (e) => { e.preventDefault(); gameScreen(el, rec.id); };
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
    el.innerHTML = `<div id="game-naka"><h1>半分まで来た。あと少し！</h1><p class="nobi" aria-hidden="true">🙆</p>
      <div class="btns"><button id="tsuzukeru">続ける</button><button class="sub" id="hitoyasumi">ひと休み</button></div></div>`;
    el.querySelector('#tsuzukeru').onclick = () => res(true);
    // 「ひと休み」：ここで止まり、後で続きから（問題の画面の右下の「ひと休み」と同じ働き）
    el.querySelector('#hitoyasumi').onclick = () => { hitoyasumi(); res(false); };
  });

  const tsugi = async () => {
    if (yameta || kono !== imaNoGame) return;
    if (owatta(rec)) { owariGamen(); return; }
    if (rec.shurui !== 'mijikai' && rec.shurui !== 'taiken' && settei.HRの長さ >= 45 && !rec.yasunda && Object.keys(rec.kekka).length >= Math.floor(zenbuOf(rec) / 2)) {
      rec.yasunda = true;
      saveRecord(rec);
      if (!(await yasumiGamen())) return;
    }
    // 13便のもと（実機で見つかった所）：次の問題が決まるまで、前の画面のままにする（白い画面で待たせない）。
    // 前の画面のボタンは押せないようにし、2秒を超えたら小さく「次を 準備しています…」を出す
    const mae = el.querySelector('#game-naka');
    let matsu = null;
    if (mae) {
      mae.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      mae.setAttribute('aria-busy', 'true');
      matsu = setTimeout(() => { if (!el.querySelector('#junbi')) mae.insertAdjacentHTML('afterbegin', '<p class="junbi" id="junbi" aria-live="polite">次を 準備しています…</p>'); }, 2000);
    }
    let r;
    // 36便：短い体験では Claude を呼ばない（決まった順で出す。公開デモの呼べる回数を使わない）
    if (rec.shurui === 'taiken' || isTaiken(rec.id)) r = null;
    else {
      try {
        r = await api('tsugi', { record: okuruKiroku(rec) }, 15000);
      } catch {
        r = null;
      }
    }
    clearTimeout(matsu);
    if (yameta || kono !== imaNoGame) return;
    const naka = frame();
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
    if (yameta || kono !== imaNoGame) return;
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
  if (st.kind === 'D') return '次は 質問 💬';
  const e = EJIRUSHI[st.mode] || '';
  if (st.renshu) return `次は 練習（${e}）`;
  return atarashii ? `次は 新しい問題（${e}）` : `次は ${e}`;
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
    let toiKikuKaisu = 0; // 問いの文を聞き直した回数（12便 P5）
    // 12便 P5：時間の起点を3つの棚でそろえる。問題が画面に出たとき（A の読む版は本文が出たとき・聞く版は聞く画面が出たとき）から、最後の答えまで
    const t0 = performance.now();

    // 1：本文
    if (kiku) {
      box.innerHTML = `${tsukuttaLabel}
        <div class="btns"><button id="play" class="sub">▶ 聞く</button><button id="next" disabled>次へ</button></div>`;
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
        <div class="btns"><button id="next">次へ</button></div>`;
      box.querySelector('#next').onclick = () => toi();
    }

    // 2：問い（1つずつ）
    const kotae = [];
    function toi() {
      const i = kotae.length;
      if (i >= p.問い.length) {
        tomeru();
        const seikai = kotae.filter((k, j) => k === p.問い[j].答え).length;
        resolve({ seikai, kazu: p.問い.length, ms: Math.round(performance.now() - t0), kiten: 'hyouji', mikaeshi, kikuKaisu, toiKikuKaisu, kotae, koe: st.mode === 'kiku' ? koeNoNamae() : undefined, yomiageNashi: yomiageNashi || undefined });
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
        <div class="marubatsu"><button data-k="1" class="maru"><span aria-hidden="true">○</span> 合う</button><button data-k="0" class="batsu"><span aria-hidden="true">×</span> 違う</button></div>`;
      if (kiku) {
        yomu(q.文);
        box.querySelector('#again').onclick = () => { toiKikuKaisu++; yomu(q.文); };
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

// 場面の問題の画面（ゲームと、先生の「文と図を見比べる」で同じものを使う）。
// 13便のもと（実機で見つかった所）：図・問い・選択肢が1画面に収まるように。広い画面では場面を左、問いと選択肢を右に並べる
export function bamenNoGamen(q, mode, i) {
  const t = q.問い[i];
  return `<div class="bamen-wrap">
        <div class="bamen-hidari"><p class="bamen-dai">${esc(q.題 || '')}</p>
        ${mode === 'zu' ? `<div class="box zu-waku-bamen">${bamenZu(q.図)}</div>` : `<div class="honbun">${esc(q.文)}</div>`}</div>
        <div class="bamen-migi"><p class="toi-mae">${i + 1}／${q.問い.length}</p>
        <div class="toi">${esc(t.文)}</div>
        <div class="btns tate">${t.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div></div></div>`;
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
        resolve({ seikai, kazu: q.問い.length, ms: Math.round(performance.now() - t0), kiten: 'hyouji', kotae: kotae.map((k, j) => q.問い[j].選択肢[k]) });
        return;
      }
      const t = q.問い[i];
      // 12便 P3：生活の場面。文の版は文だけ、図の版は図だけ（同じ内容）。題は両方に出す
      box.innerHTML = bamenNoGamen(q, st.mode, i);
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
    const t0 = performance.now(); // 時間は、問題（連絡）が出たときから最後の答えまで（3つの棚で同じ起点・12便 P5）
    const shijiHtml = (upto) => `<div class="honbun"><p>${esc(p.前おき)}</p><ol>${p.連絡.slice(0, upto).map((x, i) => (ikki || i === upto - 1 ? `<li>${esc(x)}</li>` : '')).join('')}</ol></div>`;
    const yomu = (i) => {
      // 一気に：はじめに全部。区切って：i 番目の文だけ
      const upto = ikki ? p.連絡.length : i + 1;
      box.innerHTML = `
        ${ikki ? '' : `<p class="toi-mae">${i + 1}／${p.連絡.length}</p>`}
        ${ikki ? shijiHtml(upto) : `<div class="honbun">${i === 0 ? `<p>${esc(p.前おき)}</p>` : ''}<p>${esc(p.連絡[i])}</p></div>`}
        <div class="btns"><button id="next">次へ</button></div>`;
      box.querySelector('#next').onclick = () => toi(i);
    };
    const toi = (i) => {
      if (i >= p.問い.length) {
        const seikai = kotae.filter((k, j) => k === p.問い[j].答え).length;
        resolve({ seikai, kazu: p.問い.length, ms: Math.round(performance.now() - t0), kiten: 'hyouji', mikaeshi, kotae: kotae.map((k, j) => p.問い[j].選択肢[k]) });
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
