// 比べ方と順番の決まり（画面とサーバーの両方で使う）
// 決まりの元：docs/作り方の決まり.md の 3章
// - 比べるのは同じ子の別の出し方とだけ
// - 初回の1組は練習で、比べる数に入れない（読む／聞く）
// - 出し方の順番は ABBA。どの文章をどの出し方で出すかも入れ替える
// - 「候補」は、同じ出し方を2回やったときの揺れより大きい差が、同じ向きに2回出たときだけ

export const DASHIKATA = {
  yomu: '読む',
  kiku: '聞く',
  bun: '文で見る',
  zu: '図で見る',
  ikki: '一気に出す',
  kugiri: '一文ずつ区切って出す',
};

// 棚ごとの比べる組（[もとの出し方, スイッチの出し方]）
export const KUMI = {
  A: ['yomu', 'kiku'],
  B: ['bun', 'zu'],
  C: ['ikki', 'kugiri'],
};

export const RENSHU = ['A-r1', 'A-r2'];
const RETSU = {
  A: ['A-r1', 'A-r2', 'A-1', 'A-2', 'A-3', 'A-4'],
  B: ['B-1', 'B-2', 'B-3', 'B-4'],
  C: ['C-1', 'C-2', 'C-3', 'C-4'],
  D: ['D1', 'D2', 'D3', 'D4'],
};
export const ZENBU = Object.values(RETSU).flat().length;

// 予備の動き：Claude が使えないときの、決まった順（種類を混ぜる）
export const YOBI_JUN = ['A-r1', 'A-r2', 'A-1', 'D1', 'A-2', 'B-1', 'A-3', 'C-1', 'A-4', 'D2', 'B-2', 'C-2', 'B-3', 'D3', 'C-3', 'B-4', 'C-4', 'D4'];

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// 子ごとの入れ替え。仮の番号から決めるので、同じ子は何度開いても同じ順になる
export function makeJunban(karibango) {
  const h = hash(karibango);
  return {
    A: { saisho: h & 1 ? 'kiku' : 'yomu', irekae: Boolean(h & 2) },
    B: { saisho: h & 4 ? 'zu' : 'bun', irekae: Boolean(h & 8) },
    C: { saisho: h & 16 ? 'kugiri' : 'ikki', irekae: Boolean(h & 32) },
  };
}

function abba(kind, j, mondai) {
  const [m1, m2] = KUMI[kind];
  const a = j.saisho === m2 ? m2 : m1;
  const b = a === m1 ? m2 : m1;
  const order = j.irekae ? [mondai[1], mondai[0], mondai[3], mondai[2]] : mondai;
  return [
    { id: `${kind}-1`, kind, mode: a, mondai: order[0], kai: 1 },
    { id: `${kind}-2`, kind, mode: b, mondai: order[1], kai: 1 },
    { id: `${kind}-3`, kind, mode: b, mondai: order[2], kai: 2 },
    { id: `${kind}-4`, kind, mode: a, mondai: order[3], kai: 2 },
  ];
}

export function makeSteps(j) {
  const hoka = j.A.saisho === 'yomu' ? 'kiku' : 'yomu';
  return [
    { id: 'A-r1', kind: 'A', mode: j.A.saisho, mondai: 'A0a', renshu: true },
    { id: 'A-r2', kind: 'A', mode: hoka, mondai: 'A0b', renshu: true },
    ...abba('A', j.A, ['A1', 'A2', 'A3', 'A4']),
    ...abba('B', j.B, ['B1', 'B2', 'B3', 'B4']),
    ...abba('C', j.C, ['C1', 'C2', 'C3', 'C4']),
    { id: 'D1', kind: 'D', mondai: 'D1' },
    { id: 'D2', kind: 'D', mondai: 'D2' },
    { id: 'D3', kind: 'D', mondai: 'D3' },
    { id: 'D4', kind: 'D', mondai: 'D4' },
  ];
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
  if (st.kind === 'B') return `文で見る問題と図で見る問題を、同じ回数ずつ試したいので、次は「${DASHIKATA[st.mode]}」です。`;
  if (st.kind === 'C') return `連絡を一気に読む問題と、一文ずつ区切って読む問題を、同じ回数ずつ試したいので、次は「${DASHIKATA[st.mode]}」です。`;
  return '問題が続いたので、ここで選んで答える質問を1つはさみます。';
}

const KAZU = { A: 4, B: 2, C: 4 };

// 1つの棚のまとめ（本人の中だけで比べる）
export function matome(record, kind) {
  const [m1, m2] = KUMI[kind];
  const steps = makeSteps(record.junban).filter((s) => s.kind === kind && !s.renshu);
  const get = (id) => steps.find((s) => s.id === id);
  const k = (id) => {
    const r = record.kekka?.[id];
    return !r || r.yomiageNashi || r.seikai == null ? null : r;
  };
  const out = { kind, kumi: [m1, m2], [m1]: [], [m2]: [], jikan: { [m1]: [], [m2]: [] }, kazu: KAZU[kind] };
  for (const st of steps) {
    const r = k(st.id);
    if (!r) continue;
    out[st.mode].push(r.seikai);
    out.jikan[st.mode].push(r.ms ?? null);
  }
  // 1回目の比べ：-1 と -2、2回目：-3 と -4。差は（スイッチの出し方）−（もとの出し方）
  const sa = [];
  for (const [p, q] of [[`${kind}-1`, `${kind}-2`], [`${kind}-3`, `${kind}-4`]]) {
    const a = k(p);
    const b = k(q);
    if (!a || !b) continue;
    const swSide = get(p).mode === m2 ? a.seikai : b.seikai;
    const motoSide = get(p).mode === m1 ? a.seikai : b.seikai;
    sa.push(swSide - motoSide);
  }
  out.sa = sa;
  out.kakunin = sa.length; // 確かめた回数（比べた組の数）
  out.yure = out[m1].length === 2 && out[m2].length === 2
    ? Math.max(Math.abs(out[m1][0] - out[m1][1]), Math.abs(out[m2][0] - out[m2][1]))
    : null;
  if (sa.length < 2 || out.yure == null) out.kekka = 'mada';
  else if (Math.sign(sa[0]) === Math.sign(sa[1]) && sa[0] !== 0 && Math.min(Math.abs(sa[0]), Math.abs(sa[1])) > out.yure) out.kekka = sa[0] > 0 ? m2 : m1;
  else out.kekka = 'nashi';
  out.tsuyosa = out.kekka === 'mada' || out.kekka === 'nashi' ? 0 : Math.min(Math.abs(sa[0]), Math.abs(sa[1])) / out.kazu;
  return out;
}

export function matomeA(record) {
  return matome(record, 'A');
}

// 候補になった出し方 → カード
const CARD_OF = { kiku: 'kiku', yomu: 'yomu', zu: 'zu', kugiri: 'kugiru' };

// スイッチカードを選ぶ。強みだけ。全員に1枚。候補が2つ以上なら、差のいちばん大きいものを1枚。
export function erabuCard(record) {
  const kouhoList = ['A', 'B', 'C']
    .map((kind) => matome(record, kind))
    .filter((m) => CARD_OF[m.kekka])
    .sort((x, y) => y.tsuyosa - x.tsuyosa);
  if (kouhoList.length) return CARD_OF[kouhoList[0].kekka];
  if (matome(record, 'A').kekka === 'nashi') return 'dore';
  return 'tameshita';
}

// ---- 回をまたいで比べる（3便）
// 比べるのは「その回の中の出し方の差」どうし。素点を回ごとに比べない（2回目は慣れて上がりやすいため）。
// その回の向き：その回の2組の差が、どちらも同じ向き（0 でない）のとき、その出し方の向き。
// くり返し出た候補：ある回で「その回の候補」（揺れより大きい差が同じ向きに2組）になり、
//   別の日の回でも同じ向きの差が出ていて、どの回にも反対向きの「その回の候補」が無いとき。
export const TANA_MEI = { A: '読む／聞く', B: '文で見る／図で見る', C: '一気に／区切って' };

export function kaiNoMuki(m) {
  if (m.sa.length < 2) return null;
  if (m.sa[0] !== 0 && Math.sign(m.sa[0]) === Math.sign(m.sa[1])) return m.sa[0] > 0 ? m.kumi[1] : m.kumi[0];
  return null;
}

// 同じ日の回は、くり返しの数では1つの日として数える（4便：同じ日に2回やるのは止めないが、くり返しには数えない）
const hiNoKagi = (r) => r.hi || `回${r.kai}`;

export function matomeKai(kaiList, kind) {
  const rows = kaiList.map((rec, i) => {
    const m = matome(rec, kind);
    return { kai: rec.kai ?? i + 1, hi: rec.hi ?? null, sa: m.sa, yure: m.yure, muki: kaiNoMuki(m), ookii: m.kekka !== 'nashi' && m.kekka !== 'mada', kekka: m.kekka, kazu: m.kazu };
  });
  const kumi = KUMI[kind];
  let kurikaeshi = null;
  let onaji = [];
  let onajiHi = [];
  for (const d of kumi) {
    const kouhoKai = rows.filter((r) => r.ookii && r.muki === d);
    const onajiKai = rows.filter((r) => r.muki === d);
    const hi = [...new Set(onajiKai.map(hiNoKagi))];
    const hantai = rows.filter((r) => r.ookii && r.muki && r.muki !== d);
    // 「その回の候補」が1回以上あり、同じ向きの差が2つ以上の別の日に出ていて、反対向きの候補が無い
    if (kouhoKai.length >= 1 && hi.length >= 2 && hantai.length === 0) {
      kurikaeshi = d;
      onaji = onajiKai.map((r) => r.kai);
      onajiHi = hi;
    }
  }
  const zenHi = [...new Set(rows.map(hiNoKagi))];
  return { kind, kumi, rows, kurikaeshi, onaji, onajiHi, zenHi, kaisu: rows.filter((r) => r.sa.length === 2).length };
}

// その時点で渡すカード：くり返し出た棚ごとに1枚。くり返しが無ければ、いちばん新しい回から1枚。
export function watasuCards(kaiList) {
  const owatta = kaiList.filter((r) => r.owari !== false);
  if (!owatta.length) return [{ card: 'tameshita', kurikaeshi: null }];
  const kuri = ['A', 'B', 'C']
    .map((k) => matomeKai(owatta, k))
    .filter((x) => CARD_OF[x.kurikaeshi])
    .sort((x, y) => y.onajiHi.length - x.onajiHi.length)
    .map((x) => ({ card: CARD_OF[x.kurikaeshi], kurikaeshi: { kind: x.kind, mode: x.kurikaeshi, onaji: x.onaji, onajiHi: x.onajiHi, zenkai: x.zenHi.length } }));
  if (kuri.length) return kuri;
  return [{ card: erabuCard(owatta[owatta.length - 1]), kurikaeshi: null }];
}

// 持っているカード（4便）：回ごとに渡したカードがたまる。一度渡したカードは消えない。
// 同じカードをまた渡したときは、新しいほうの文にする。新しく増えたカードを前に出す。
export function motteiruCards(kaiList) {
  const owatta = kaiList.filter((r) => r.owari !== false);
  const held = new Map();
  let atarashii = [];
  for (let i = 1; i <= Math.max(owatta.length, 1); i++) {
    const mae = owatta.slice(0, i);
    const last = mae[mae.length - 1];
    const ima = watasuCards(mae);
    if (i === Math.max(owatta.length, 1)) atarashii = ima.filter((g) => !held.has(g.card)).map((g) => g.card);
    ima.forEach((g, j) => held.set(g.card, { ...g, kai: last?.kai ?? null, hi: last?.hi ?? null, jun: i * 10 - j }));
  }
  const cards = [...held.values()].sort((x, y) => (atarashii.includes(y.card) - atarashii.includes(x.card)) || y.jun - x.jun);
  return { cards, atarashii };
}

// いちばん前に出すカード（伝え方・学習につなぐ・仮説の予備の文が使う）
export function erabuCardKai(kaiList) {
  const { cards } = motteiruCards(kaiList);
  return { card: cards[0].card, kurikaeshi: cards[0].kurikaeshi };
}

// カードの文に、回の数を入れる（くり返しのときだけ）
export function cardNoBun(card, kurikaeshi) {
  if (!kurikaeshi || !card.くり返しのとき) return card;
  const ireru = (t) => t.replaceAll('{全日}', String(kurikaeshi.zenkai)).replaceAll('{同じ日}', String((kurikaeshi.onajiHi || kurikaeshi.onaji).length));
  const k = card.くり返しのとき;
  return { ...card, ひとこと: ireru(k.ひとこと), これは何か: ireru(k.これは何か), 保護者向け: ireru(k.保護者向け) };
}

export function kotaeD(record, tana) {
  return ['D1', 'D2', 'D3', 'D4'].map((id) => ({ id, toi: tana.D.質問[id].問い, kotae: record.kekka?.[id]?.kotae ?? null }));
}

const KEKKA_SETSUMEI = {
  mada: 'まだ2回そろっていない',
  nashi: '揺れより大きい差は、同じ向きに2回は出なかった（差なし）',
};
function summary(m) {
  const [m1, m2] = m.kumi;
  return {
    各回の問いの数: m.kazu,
    [`${DASHIKATA[m1]}の正解`]: m[m1],
    [`${DASHIKATA[m2]}の正解`]: m[m2],
    同じ出し方での揺れ: m.yure,
    [`${DASHIKATA[m2]}−${DASHIKATA[m1]}の差_各回`]: m.sa,
    確かめた回数: m.kakunin,
    結果: KEKKA_SETSUMEI[m.kekka] || `「${DASHIKATA[m.kekka]}」のほうが、2回とも揺れより大きく正解が多かった（候補）`,
  };
}

function kaiSummary(x) {
  return {
    回ごと: x.rows.map((r) => ({ 回: r.kai, 差_2組: r.sa, 揺れ: r.yure, 向き: r.muki ? DASHIKATA[r.muki] : 'なし', 揺れより大きいか: r.ookii ? 'はい（その回の候補）' : 'いいえ' })),
    くり返し出た候補: x.kurikaeshi ? `「${DASHIKATA[x.kurikaeshi]}」（${x.onaji.join('・')}回目で同じ向き。別々の日は${x.onajiHi.length}日）` : 'なし',
    決まり: '同じ日の回は、くり返しの数では1つの日として数える',
  };
}

// Claude に送るまとめ（名前・仮の番号は入れない）。kaiList があれば、回をまたいだ結果も入れる
export function claudeNiOkuru(record, tana, atehamaru, kaiList) {
  const mata = kaiList && kaiList.length > 1
    ? { 回をまたいだ結果: { ゲームの回数: kaiList.length, 決まり: '比べるのは各回の中の出し方の差どうし。素点は回ごとに比べない', 読む聞く: kaiSummary(matomeKai(kaiList, 'A')), 図: kaiSummary(matomeKai(kaiList, 'B')), 一気に区切って: kaiSummary(matomeKai(kaiList, 'C')) } }
    : {};
  return {
    ...mata,
    最後の回:
{
      読む聞く: summary(matome(record, 'A')),
      図: summary(matome(record, 'B')),
      一気に区切って: summary(matome(record, 'C')),
      選んだ答え: kotaeD(record, tana).map((d) => ({ 問い: d.toi, 答え: d.kotae ?? '（答えていない）' })),
    },
    チェック項目で当てはまったこと: atehamaru,
  };
}

// チェック項目のうち画面に出すもの：06 の項目＋「先生が選ぶ候補」のうち先生が選んだものだけ
export function mieruKoumoku(checklist) {
  return [...(checklist.項目 || []), ...(checklist.先生が選ぶ候補 || []).filter((x) => x.先生が選んだ === true)];
}
