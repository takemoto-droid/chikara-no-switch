// 比べ方と順番の決まり（画面とサーバーの両方で使う）
// 決まりの元：docs/作り方の決まり.md の 3章
// - 比べるのは同じ子の別の出し方とだけ
// - 初回の1組は練習で、比べる数に入れない
// - 出し方の順番は ABBA。どの文章をどの出し方で出すかも入れ替える
// - 「候補」は、揺れより大きい差が、同じ向きに2回出たときだけ

export const DASHIKATA = {
  yomu: '読む',
  kiku: '聞く',
  zu: '図を添える',
  bun: '文だけ',
  kugiri: '意味のまとまりで区切る',
  tsuzuke: '続けて書く',
};

export const RENSHU = ['A-r1', 'A-r2'];
const RETSU = {
  A: ['A-r1', 'A-r2', 'A-1', 'A-2', 'A-3', 'A-4'],
  B: ['B-1', 'B-2'],
  C: ['C-1', 'C-2'],
  D: ['D1', 'D2', 'D3', 'D4'],
};

// 予備の動き：Claude が使えないときの、決まった順
export const YOBI_JUN = ['A-r1', 'A-r2', 'A-1', 'D1', 'A-2', 'B-1', 'A-3', 'D2', 'A-4', 'B-2', 'D3', 'C-1', 'C-2', 'D4'];

// 子ごとの入れ替え。仮の番号から決めるので、同じ子は何度開いても同じ順になる
export function makeJunban(karibango) {
  let h = 0;
  for (const ch of String(karibango)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return {
    saisho: h & 1 ? 'kiku' : 'yomu',
    irekae: Boolean(h & 2),
    zu: h & 4 ? 'B2' : 'B1',
    kugiri: h & 8 ? 'C2' : 'C1',
  };
}

export function makeSteps(j) {
  const hoka = j.saisho === 'yomu' ? 'kiku' : 'yomu';
  const bunsho = j.irekae ? ['A2', 'A1', 'A4', 'A3'] : ['A1', 'A2', 'A3', 'A4'];
  const s = [
    { id: 'A-r1', kind: 'A', mode: j.saisho, mondai: 'A0a', renshu: true },
    { id: 'A-r2', kind: 'A', mode: hoka, mondai: 'A0b', renshu: true },
    { id: 'A-1', kind: 'A', mode: j.saisho, mondai: bunsho[0], kai: 1 },
    { id: 'A-2', kind: 'A', mode: hoka, mondai: bunsho[1], kai: 1 },
    { id: 'A-3', kind: 'A', mode: hoka, mondai: bunsho[2], kai: 2 },
    { id: 'A-4', kind: 'A', mode: j.saisho, mondai: bunsho[3], kai: 2 },
    { id: 'B-1', kind: 'B', mode: j.zu === 'B1' ? 'zu' : 'bun', mondai: 'B1' },
    { id: 'B-2', kind: 'B', mode: j.zu === 'B2' ? 'zu' : 'bun', mondai: 'B2' },
    { id: 'C-1', kind: 'C', mode: j.kugiri === 'C1' ? 'kugiri' : 'tsuzuke', mondai: 'C1' },
    { id: 'C-2', kind: 'C', mode: j.kugiri === 'C2' ? 'kugiri' : 'tsuzuke', mondai: 'C2' },
    { id: 'D1', kind: 'D', mondai: 'D1' },
    { id: 'D2', kind: 'D', mondai: 'D2' },
    { id: 'D3', kind: 'D', mondai: 'D3' },
    { id: 'D4', kind: 'D', mondai: 'D4' },
  ];
  return s;
}

export function stepOf(record, id) {
  return makeSteps(record.junban).find((s) => s.id === id);
}

// 今、次に出してよいもの（Claude はこの中から選ぶ）
export function kouho(record) {
  const done = record.kekka || {};
  const heads = [];
  for (const k of ['A', 'B', 'C', 'D']) {
    const head = RETSU[k].find((id) => !done[id]);
    if (head) heads.push(head);
  }
  // 練習が終わるまでは練習だけ
  if (RENSHU.some((id) => !done[id])) return heads.filter((id) => id.startsWith('A-r'));
  return heads;
}

export function owatta(record) {
  return kouho(record).length === 0;
}

export function yobiNext(record) {
  const c = kouho(record);
  return YOBI_JUN.find((id) => c.includes(id)) || null;
}

export function yobiRiyuu(record, id) {
  const st = stepOf(record, id);
  if (!st) return '';
  if (id === 'A-r1') return `はじめは練習です。やり方に慣れるために、「${DASHIKATA[st.mode]}」出し方から始めます。`;
  if (id === 'A-r2') return `練習のもう1つです。今度は「${DASHIKATA[st.mode]}」出し方を試します。`;
  if (st.kind === 'A') return `読む出し方と聞く出し方を、同じ回数ずつ試したいので、次は「${DASHIKATA[st.mode]}」です。`;
  if (st.kind === 'B') return '出し方の種類を変えて、図のある問題と、文だけの問題を試します。';
  if (st.kind === 'C') return '文章の書き方を変えて、区切りのある文章と、続けて書いた文章を試します。';
  return '問題が続いたので、ここで選んで答える質問を1つはさみます。';
}

function seikaiOf(record, id) {
  const k = record.kekka?.[id];
  if (!k || k.yomiageNashi) return null;
  return k.seikai;
}

// 読む／聞くのまとめ（本人の中だけで比べる）
export function matomeA(record) {
  const steps = makeSteps(record.junban);
  const get = (id) => steps.find((s) => s.id === id);
  const out = { yomu: [], kiku: [], jikan: { yomu: [], kiku: [] }, kazu: 4 };
  for (const id of ['A-1', 'A-2', 'A-3', 'A-4']) {
    const st = get(id);
    const k = record.kekka?.[id];
    if (!k || k.yomiageNashi) continue;
    out[st.mode].push(k.seikai);
    out.jikan[st.mode].push(k.ms ?? null);
  }
  // 1回目の比べ：A-1 と A-2、2回目：A-3 と A-4
  const sa = [];
  for (const [p, q] of [['A-1', 'A-2'], ['A-3', 'A-4']]) {
    const a = seikaiOf(record, p);
    const b = seikaiOf(record, q);
    if (a == null || b == null) continue;
    const kikuSide = get(p).mode === 'kiku' ? a : b;
    const yomuSide = get(p).mode === 'yomu' ? a : b;
    sa.push(kikuSide - yomuSide);
  }
  out.sa = sa; // 正の数：聞くほうが正解が多い
  out.kakunin = sa.length; // 確かめた回数（比べた組の数）
  if (out.yomu.length === 2 && out.kiku.length === 2) {
    out.yure = Math.max(Math.abs(out.yomu[0] - out.yomu[1]), Math.abs(out.kiku[0] - out.kiku[1]));
  } else {
    out.yure = null;
  }
  if (sa.length < 2 || out.yure == null) {
    out.kekka = 'mada';
  } else if (Math.sign(sa[0]) === Math.sign(sa[1]) && sa[0] !== 0 && Math.min(Math.abs(sa[0]), Math.abs(sa[1])) > out.yure) {
    out.kekka = sa[0] > 0 ? 'kiku' : 'yomu';
  } else {
    out.kekka = 'nashi';
  }
  return out;
}

// 図・区切りのまとめ（この便では1組だけなので、決めない）
export function matomePair(record, kind) {
  const steps = makeSteps(record.junban).filter((s) => s.kind === kind);
  const out = { kakunin: 0, kekka: 'mada', kazu: kind === 'B' ? 1 : 4 };
  for (const st of steps) {
    const k = record.kekka?.[st.id];
    if (k) out[st.mode] = k.seikai;
  }
  const modes = kind === 'B' ? ['zu', 'bun'] : ['kugiri', 'tsuzuke'];
  if (modes.every((m) => out[m] != null)) out.kakunin = 1;
  return out;
}

// スイッチカードを選ぶ。強みだけ。全員に1枚。
export function erabuCard(record) {
  const a = matomeA(record);
  if (a.kekka === 'kiku') return 'kiku';
  if (a.kekka === 'yomu') return 'yomu';
  if (a.kekka === 'nashi') return 'dore';
  return 'tameshita';
}

export function kotaeD(record, tana) {
  const out = [];
  for (const id of ['D1', 'D2', 'D3', 'D4']) {
    const q = tana.D.質問[id];
    const k = record.kekka?.[id];
    out.push({ id, toi: q.問い, kotae: k ? k.kotae : null });
  }
  return out;
}

// Claude に送るまとめ（名前・仮の番号は入れない）
export function claudeNiOkuru(record, tana, atehamaru) {
  return {
    読む聞く: summaryA(matomeA(record)),
    図: matomePair(record, 'B'),
    区切り: matomePair(record, 'C'),
    選んだ答え: kotaeD(record, tana).map((d) => ({ 問い: d.toi, 答え: d.kotae ?? '（答えていない）' })),
    チェック項目で当てはまったこと: atehamaru,
  };
}

function summaryA(a) {
  return {
    各回の問いの数: a.kazu,
    読むの正解: a.yomu,
    聞くの正解: a.kiku,
    同じ出し方での揺れ: a.yure,
    聞くと読むの差_各回: a.sa,
    確かめた回数: a.kakunin,
    結果: { kiku: '聞くほうが2回とも揺れより大きく正解が多かった（候補）', yomu: '読むほうが2回とも揺れより大きく正解が多かった（候補）', nashi: '揺れより大きい差は、同じ向きに2回は出なかった（差なし）', mada: 'まだ2回そろっていない' }[a.kekka],
  };
}
