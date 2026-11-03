// ② ゲーム。Claude が次の問題を選び、その理由を画面に出す。途中で止めて、続きから始められる。
import { esc, api, data, okuruKiroku, whoLabel } from './util.js';
import { getRecord, saveRecord, isDemo } from './kiroku.js';
import { kouho, owatta, yobiNext, yobiRiyuu, stepOf, DASHIKATA, ZENBU } from './kurabe.js';
import { junbiYomiage, yomu, tomeru, koeNoNamae } from './yomiage.js';
import { tapeZu } from './zu.js';


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

  const frame = () => {
    const n = Object.keys(rec.kekka).length;
    el.innerHTML = `
      <h1>ゲーム</h1>
      <div class="progress" aria-hidden="true"><div style="width:${Math.round((n / ZENBU) * 100)}%"></div></div>
      <div id="game-naka"></div>
      <div class="btns"><button class="sub" id="tomeru">ここで止める（続きはあとで）</button></div>
      ${yomiageOK ? '' : '<div class="box chui small">この端末では読み上げが使えません。聞く問題は文字で出します（その回は比べる数に入れません）。</div>'}`;
    el.querySelector('#tomeru').onclick = () => {
      yameta = true;
      tomeru();
      saveRecord(rec);
      el.innerHTML = `<h1>ここで止めました</h1><p>ここまでの答えは、この端末に残してあります。続きは、また「続きから」で始められます。</p>
        <div class="btns"><a class="btn" href="#/game/${encodeURIComponent(rec.id)}">続きから始める</a><a class="btn sub" href="#/">はじめの画面へ</a></div>`;
    };
    return el.querySelector('#game-naka');
  };

  const owariGamen = () => {
    rec.owari = true;
    rec.owariJi = Date.now();
    saveRecord(rec);
    el.innerHTML = `<h1>おつかれさまでした</h1><p>全部の問題に取り組みました。あなたのスイッチカードができました。</p>
      <div class="btns"><a class="btn" href="#/card/${encodeURIComponent(rec.id)}">スイッチカードを見る</a></div>`;
  };

  const tsugi = async () => {
    if (yameta) return;
    if (owatta(rec)) { owariGamen(); return; }
    const naka = frame();
    naka.innerHTML = '<div class="riyuu" aria-live="polite">次の問題を選んでいます…</div>';
    let r;
    try {
      r = await api('tsugi', { record: okuruKiroku(rec) }, 15000);
    } catch {
      r = null;
    }
    if (yameta) return;
    if (!r || !kouho(rec).includes(r.next)) {
      const nid = yobiNext(rec);
      r = { next: nid, riyuu: yobiRiyuu(rec, nid), dare: 'yobi', wake: 'サーバーにつながらないので、決まった順の予備の動きで出しています。' };
    }
    const st = stepOf(rec, r.next);
    const who = r.dare === 'claude' ? 'Claude（AI）が次の問題を選んだ理由' : r.dare === 'kimari' ? '決まった順' : '決まった順（予備の動き）';
    naka.innerHTML = `
      <div class="riyuu" id="riyuu"><span class="who">${esc(who)}</span>${esc(r.riyuu)}</div>
      ${r.wake ? `<p class="muted">${esc(r.wake)}</p>` : ''}
      <p><strong>${esc(midashi(st))}</strong></p>
      <div class="btns"><button id="hajimeru">はじめる</button></div>`;
    naka.querySelector('#hajimeru').onclick = async () => {
      const box = naka;
      const kekka = await jikko(st, tana, box, yomiageOK);
      if (yameta) return;
      rec.kekka[st.id] = kekka;
      rec.erabi = [...(rec.erabi || []), { step: st.id, riyuu: r.riyuu, dare: r.dare }];
      saveRecord(rec);
      tsugi();
    };
  };
  tsugi();
}

function midashi(st) {
  if (st.kind === 'D') return '選んで答える質問';
  if (st.kind === 'A') return `${st.renshu ? '練習：' : ''}${st.mode === 'kiku' ? '聞いて' : '読んで'}答える問題`;
  if (st.kind === 'B') return '場面に合う式を選ぶ問題（計算はしません）';
  return st.mode === 'kugiri' ? '指示を一文ずつ読んで答える問題' : '指示をまとめて読んで答える問題';
}

function jikko(st, tana, box, yomiageOK) {
  if (st.kind === 'A') return bunshoMondai(st, tana, box, yomiageOK);
  if (st.kind === 'C') return shijiMondai(st, tana, box);
  if (st.kind === 'B') return bamenMondai(st, tana, box);
  return shitsumon(st, tana, box, yomiageOK);
}

// 読む／聞くの問題
function bunshoMondai(st, tana, box, yomiageOK) {
  return new Promise((resolve) => {
    const p = tana.A.文章[st.mondai];
    const zenbun = p.本文.join('');
    const kiku = st.mode === 'kiku' && yomiageOK;
    const yomiageNashi = st.mode === 'kiku' && !yomiageOK;
    const honbunHtml = esc(zenbun);
    let mikaeshi = 0;
    let kikuKaisu = 0;

    // 1：本文
    if (kiku) {
      box.innerHTML = `<p>文章を読み上げます。よく聞いてね。何回聞いてもかまいません。</p>
        <div class="btns"><button id="play">▶ 文章を聞く</button><button id="next" class="sub" disabled>聞けた</button></div>`;
      box.querySelector('#play').onclick = async () => {
        kikuKaisu++;
        box.querySelector('#play').disabled = true;
        await yomu(zenbun);
        box.querySelector('#play').disabled = false;
        box.querySelector('#next').disabled = false;
      };
      box.querySelector('#next').onclick = () => toi();
    } else {
      box.innerHTML = `<p>${yomiageNashi ? '（読み上げが使えないので、文字で出します）' : '文章を読んでね。読めたら「読めた」を押してください。'}</p>
        <div class="honbun">${honbunHtml}</div>
        <div class="btns"><button id="next">読めた</button></div>`;
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
        <p class="muted">問い ${i + 1}／${p.問い.length}　本文と合っていますか？</p>
        <div class="toi">${kiku ? '<span class="kakushi">（この文は読み上げで聞きます）</span>' : esc(q.文)}</div>
        <div class="btns">
          ${kiku ? '<button class="sub" id="again">▶ この文をもう一度聞く</button>' : ''}
          <button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>${kiku ? '本文をもう一度聞く（1回だけ）' : '本文をもう一度見る（1回だけ）'}</button>
        </div>
        <div id="mikaeshi-box"></div>
        <div class="marubatsu"><button data-k="1">合っている</button><button data-k="0">合っていない</button></div>`;
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
        <p class="muted">問い ${i + 1}／${q.問い.length}</p>
        <div class="toi">${esc(t.文)}</div>
        <div class="btns tate">${t.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelectorAll('.choice').forEach((b) => {
        b.onclick = () => { kotae.push(Number(b.dataset.i)); toi(); };
      });
    };
    toi();
  });
}

// 一気に／区切って：長めの指示に従って考え、合う答えを選ぶ
// 一気に：4つの手順をまとめて読んでから、問い1〜4に答える
// 区切って：手順を一文ずつ読み、1つ読むごとにその問いに答える
// どちらも、問いに答えるときは指示は見えない。見返しは1回まで
function shijiMondai(st, tana, box) {
  return new Promise((resolve) => {
    const p = tana.C.文章[st.mondai];
    const ikki = st.mode === 'ikki';
    const kotae = [];
    let mikaeshi = 0;
    const t0 = performance.now(); // 時間は、読み始めから最後の答えまで（どちらの出し方も同じ数え方）
    const shijiHtml = (upto) => `<div class="honbun"><p>${esc(p.前おき)}</p><ol>${p.指示.slice(0, upto).map((x, i) => (ikki || i === upto - 1 ? `<li>${esc(x)}</li>` : '')).join('')}</ol></div>`;
    const yomu = (i) => {
      // 一気に：はじめに全部。区切って：手順 i だけ
      const upto = ikki ? p.指示.length : i + 1;
      box.innerHTML = `
        <p class="muted">${ikki ? '指示を全部読んで、読めたら「読めた」を押してください。' : `手順 ${i + 1}／${p.指示.length}：読めたら「読めた」を押してください。`}</p>
        ${ikki ? shijiHtml(upto) : `<div class="honbun">${i === 0 ? `<p>${esc(p.前おき)}</p>` : ''}<p>${esc(p.指示[i])}</p></div>`}
        <div class="btns"><button id="next">読めた</button></div>`;
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
        <p class="muted">問い ${i + 1}／${p.問い.length}　手順 ${i + 1} まで、指示のとおりにしたとき</p>
        <div class="toi">${esc(q.文)}</div>
        <div class="btns"><button class="sub" id="mikaesu" ${mikaeshi >= 1 ? 'disabled' : ''}>指示をもう一度見る（1回だけ）</button></div>
        <div id="mikaeshi-box"></div>
        <div class="btns tate">${q.選択肢.map((c, k) => `<button class="choice" data-i="${k}">${esc(c)}</button>`).join('')}</div>`;
      box.querySelector('#mikaesu').onclick = (e) => {
        mikaeshi++;
        e.target.disabled = true;
        box.querySelector('#mikaeshi-box').innerHTML = ikki ? shijiHtml(p.指示.length) : `<div class="honbun"><p>${esc(p.指示[i])}</p></div>`;
      };
      box.querySelectorAll('.choice').forEach((b) => {
        b.onclick = () => {
          kotae.push(Number(b.dataset.i));
          if (ikki) toi(i + 1);
          else if (i + 1 < p.指示.length) yomu(i + 1);
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
      ${yomiageOK ? '<div class="btns"><button class="sub" id="yomu">▶ 問いを読み上げる</button></div>' : ''}
      <p class="muted">当てはまるものを1つ選んでね。</p>
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
