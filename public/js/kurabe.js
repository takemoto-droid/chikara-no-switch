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
export const D_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

// 難しさの段階（7便・06 第3.1版の 3-3）。段階は子どもに見せない。比べるのは同じ段階の中だけ
export const DANKAI_MONDAI = {
  A: { 1: ['A1Y', 'A2Y', 'A3Y', 'A4Y'], 2: ['A1', 'A2', 'A3', 'A4'] },
  B: { 1: ['B1Y', 'B2Y', 'B3Y', 'B4Y'], 2: ['B1', 'B2', 'B3', 'B4'] },
  C: { 1: ['C1Y', 'C2Y', 'C3Y', 'C4Y'], 2: ['C1', 'C2', 'C3', 'C4'] },
};
// 選び方と切りかえの線（合成データで決めた。scripts/dankai_kurabe.mjs・docs/合成データでの確かめ.md）
export const DANKAI_KIJUN = {
  yasashime: 3 / 8, // はじめの練習（読む／聞く 2つ・8問）の正解率がこれ以下なら、段階1から
  hobo0: 0.125, // 組（2つ）の正解率がこれ以下なら「ほぼ0」
  zenbu: 1, // 組の正解率がこれなら「ほぼ全部正解」
};

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

function abba(kind, j, mondai, kara, dankai) {
  const [m1, m2] = KUMI[kind];
  const a = j.saisho === m2 ? m2 : m1;
  const b = a === m1 ? m2 : m1;
  const order = j.irekae ? [mondai[1], mondai[0], mondai[3], mondai[2]] : mondai;
  return [
    { id: `${kind}-${kara}`, kind, mode: a, mondai: order[0], kai: 1, dankai },
    { id: `${kind}-${kara + 1}`, kind, mode: b, mondai: order[1], kai: 1, dankai },
    { id: `${kind}-${kara + 2}`, kind, mode: b, mondai: order[2], kai: 2, dankai },
    { id: `${kind}-${kara + 3}`, kind, mode: a, mondai: order[3], kai: 2, dankai },
  ];
}

// その棚の段階：{ dankai: はじめの段階, kirikae: { to: 変えた先 } | null }
export function dankaiOf(dankai, kind) {
  const d = dankai?.[kind];
  return { dankai: d?.dankai === 1 ? 1 : 2, kirikae: d?.kirikae && [1, 2].includes(d.kirikae.to) ? d.kirikae : null };
}

// 棚ごとの問題の並び。1組目のあとで段階を変えたら、1組目は練習扱いにして、新しい段階で ABBA をやり直す
function tanaNoSteps(kind, j, dankai) {
  const d = dankaiOf(dankai, kind);
  const mae = abba(kind, j[kind], DANKAI_MONDAI[kind][d.dankai], 1, d.dankai);
  if (!d.kirikae) return mae;
  return [
    ...mae.slice(0, 2).map((st) => ({ ...st, renshuAtsukai: true })),
    ...abba(kind, j[kind], DANKAI_MONDAI[kind][d.kirikae.to], 5, d.kirikae.to),
  ];
}

// shurui：'hr'（② 見つける）／'mijikai'（⑦ また見つける：練習と質問なし・3つの組だけ）
export function makeSteps(j, dankai = null, shurui = 'hr') {
  const hr = shurui !== 'mijikai';
  const hoka = j.A.saisho === 'yomu' ? 'kiku' : 'yomu';
  return [
    ...(hr ? [
      { id: 'A-r1', kind: 'A', mode: j.A.saisho, mondai: 'A0a', renshu: true, dankai: 2 },
      { id: 'A-r2', kind: 'A', mode: hoka, mondai: 'A0b', renshu: true, dankai: 2 },
    ] : []),
    ...tanaNoSteps('A', j, dankai),
    ...tanaNoSteps('B', j, dankai),
    ...tanaNoSteps('C', j, dankai),
    ...(hr ? D_IDS.map((id) => ({ id, kind: 'D', mondai: id })) : []),
  ];
}

export function stepsOf(record) {
  return makeSteps(record.junban, record.dankai, record.shurui);
}

export function stepOf(record, id) {
  return stepsOf(record).find((s) => s.id === id);
}

export function zenbuOf(record) {
  return stepsOf(record).length;
}

// 練習が終わったら段階を選ぶ。組の1つ目が終わったら、切りかえを見る。変えたことを返す（先生の画面と理由に使う）
export function dankaiWoSusumeru(record) {
  const henka = [];
  const k = record.kekka || {};
  if (!record.dankai && (record.shurui === 'mijikai' || RENSHU.every((id) => k[id]))) {
    let L = 2;
    if (record.shurui !== 'mijikai') {
      const s = RENSHU.reduce((a, id) => a + (k[id].seikai ?? 0), 0);
      const n = RENSHU.reduce((a, id) => a + (k[id].kazu ?? 4), 0);
      if (s / n <= DANKAI_KIJUN.yasashime) L = 1;
    }
    record.dankai = { A: { dankai: L }, B: { dankai: L }, C: { dankai: L }, erabikata: `はじめの練習の正解 ${RENSHU.reduce((a, id) => a + (k[id].seikai ?? 0), 0)}／${RENSHU.reduce((a, id) => a + (k[id].kazu ?? 4), 0)}` };
    henka.push({ kind: 'all', to: L });
  }
  if (!record.dankai) return henka;
  for (const kind of ['A', 'B', 'C']) {
    const d = dankaiOf(record.dankai, kind);
    if (d.kirikae) continue;
    const r1 = [`${kind}-1`, `${kind}-2`].map((id) => k[id]);
    if (r1.some((x) => !x || x.seikai == null) || r1.some((x) => x.yomiageNashi)) continue;
    if (record.dankai[kind].mita) continue; // 1組目を見たのは1回だけ
    record.dankai[kind].mita = true;
    const ritsu = (r1[0].seikai + r1[1].seikai) / ((r1[0].kazu ?? 1) + (r1[1].kazu ?? 1));
    let to = null;
    if (ritsu <= DANKAI_KIJUN.hobo0 && d.dankai === 2) to = 1;
    if (ritsu >= DANKAI_KIJUN.zenbu && d.dankai === 1) to = 2;
    if (to) {
      record.dankai[kind].kirikae = { to, ritsu };
      henka.push({ kind, to });
    }
  }
  return henka;
}

// 今、次に出してよいもの（Claude はこの中から選ぶ）
export function kouho(record) {
  const done = record.kekka || {};
  const steps = stepsOf(record);
  const heads = [];
  for (const k of ['A', 'B', 'C', 'D']) {
    const head = steps.find((st) => st.kind === k && !done[st.id]);
    if (head) heads.push(head.id);
  }
  // 練習が終わるまでは練習だけ
  if (record.shurui !== 'mijikai' && RENSHU.some((id) => !done[id])) return heads.filter((id) => id.startsWith('A-r'));
  return heads;
}

export function owatta(record) {
  return kouho(record).length === 0;
}

// 予備の動き：Claude が使えないときの決まった順。棚の進み具合がいちばん少ない棚から出す（同じなら A・D・B・C の順）
export function yobiNext(record) {
  const c = kouho(record);
  if (!c.length) return null;
  const steps = stepsOf(record);
  const done = record.kekka || {};
  const susumi = (k) => steps.filter((st) => st.kind === k && done[st.id]).length / Math.max(1, steps.filter((st) => st.kind === k).length);
  const jun = ['A', 'D', 'B', 'C'];
  return [...c].sort((x, y) => susumi(x[0]) - susumi(y[0]) || jun.indexOf(x[0]) - jun.indexOf(y[0]))[0];
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

const KAZU = { A: { 1: 3, 2: 4 }, B: { 1: 2, 2: 2 }, C: { 1: 3, 2: 4 } }; // 8便：段階1の B も問い2つ

// 1つの棚のまとめ（本人の中だけで比べる）。比べるのは、最後の段階の2組だけ（段階をまたいで比べない）
export function matome(record, kind) {
  const [m1, m2] = KUMI[kind];
  const zen = stepsOf(record).filter((s) => s.kind === kind && !s.renshu);
  const d = dankaiOf(record.dankai, kind);
  const L = d.kirikae ? d.kirikae.to : d.dankai;
  const kara = d.kirikae ? 5 : 1; // 切りかえたら -5〜-8 で比べる
  const ids = [0, 1, 2, 3].map((i) => `${kind}-${kara + i}`);
  const steps = zen.filter((s) => ids.includes(s.id));
  const get = (id) => steps.find((s) => s.id === id);
  const k = (id) => {
    const r = record.kekka?.[id];
    return !r || r.yomiageNashi || r.seikai == null ? null : r;
  };
  const out = { kind, kumi: [m1, m2], [m1]: [], [m2]: [], jikan: { [m1]: [], [m2]: [] }, kazu: KAZU[kind][L], dankai: L, hajimeDankai: d.dankai, kirikae: d.kirikae ? d.kirikae.to : null, renshuAtsukai: zen.filter((s) => s.renshuAtsukai).map((s) => s.id) };
  for (const st of steps) {
    const r = k(st.id);
    if (!r) continue;
    out[st.mode].push(r.seikai);
    out.jikan[st.mode].push(r.ms ?? null);
  }
  // 1回目の比べ：1つ目と2つ目、2回目：3つ目と4つ目。差は（スイッチの出し方）−（もとの出し方）
  const sa = [];
  const kumiNoRitsu = [];
  for (const [p, q] of [[ids[0], ids[1]], [ids[2], ids[3]]]) {
    const a = k(p);
    const b = k(q);
    if (!a || !b) continue;
    const swSide = get(p).mode === m2 ? a.seikai : b.seikai;
    const motoSide = get(p).mode === m1 ? a.seikai : b.seikai;
    sa.push(swSide - motoSide);
    kumiNoRitsu.push((a.seikai + b.seikai) / ((a.kazu ?? out.kazu) + (b.kazu ?? out.kazu)));
  }
  out.sa = sa;
  out.kakunin = sa.length; // 確かめた回数（比べた組の数）
  // 比べにくかった組：正解がほとんど無い・ほとんど全部正解（先生にだけ事実で出す）
  out.kurabenikui = kumiNoRitsu.map((x, i) => (x <= DANKAI_KIJUN.hobo0 ? `${i + 1}組目は正解がほとんど無かった` : x >= DANKAI_KIJUN.zenbu ? `${i + 1}組目は全部正解だった` : null)).filter(Boolean);
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
// 見つけたカードが、どの比べから出たか（副題に使う）
export const CARD_KIND = { kiku: 'A', yomu: 'A', zu: 'B', kugiru: 'C' };

// カードの名前・副題・レベルの名前は public/data/card_namae.json の1つにまとめる（7便）。
// cards.json の文に、名前を重ねる。名前を変えるときは card_namae.json だけを書きかえる。
export function namaeWoAwaseru(cards, namae) {
  const カード = {};
  for (const [id, c] of Object.entries(cards.カード)) カード[id] = { ...c, 名前: namae.名前[id] ?? c.名前 };
  return { ...cards, カード, 副題: namae.副題, レベル: namae.レベル, 前の名前: namae.前の名前 || {} };
}

// 前の名前を、今の名前に直す（保存した Claude の文の見出し用。本文は直さない）
export function imaNoNamae(cards, mei) {
  const id = cards?.前の名前?.[mei];
  return id ? cards.カード[id]?.名前 ?? mei : mei;
}

// カードの副題（比べた2つの出し方）。見つけたカード・どれでも・ためした。
export function cardNoFukudai(cards, m) {
  const f = cards.副題 || {};
  if (m.sodate) return (m.ichininmae ? f.育てた?.[m.card] : f.そだてちゅう?.[m.card]) ?? '';
  if (m.card === 'dore') return f.どれでも ?? '';
  if (m.card === 'tameshita') return f.ためした ?? '';
  const kind = m.kind ?? CARD_KIND[m.card];
  return kind ? f.見つけた?.[kind] ?? '' : '';
}

// レベルの名前（card_namae.json の「レベル」）
export function levelNoNamae(cards, m) {
  if (m.level == null) return '';
  const L = m.sodate ? cards.レベル?.育てる : cards.レベル?.見つけた;
  return L?.[m.level - 1] ?? '';
}

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
    return { kai: rec.kai ?? i + 1, hi: rec.hi ?? null, sa: m.sa, yure: m.yure, muki: kaiNoMuki(m), ookii: m.kekka !== 'nashi' && m.kekka !== 'mada', kekka: m.kekka, kazu: m.kazu, dankai: m.dankai, kirikae: m.kirikae, kurabenikui: m.kurabenikui };
  });
  const kumi = KUMI[kind];
  let kurikaeshi = null;
  let onaji = [];
  let onajiHi = [];
  let zenHi = [...new Set(rows.map(hiNoKagi))];
  // 比べるのは同じ段階の中だけ（7便）：段階ごとに分けて、くり返しを見る
  for (const L of [...new Set(rows.map((r) => r.dankai))]) {
    const rL = rows.filter((r) => r.dankai === L);
    for (const d of kumi) {
      const kouhoKai = rL.filter((r) => r.ookii && r.muki === d);
      const onajiKai = rL.filter((r) => r.muki === d);
      const hi = [...new Set(onajiKai.map(hiNoKagi))];
      const hantai = rL.filter((r) => r.ookii && r.muki && r.muki !== d);
      // 「その回の候補」が1回以上あり、同じ向きの差が2つ以上の別の日に出ていて、反対向きの候補が無い
      if (kouhoKai.length >= 1 && hi.length >= 2 && hantai.length === 0) {
        kurikaeshi = d;
        onaji = onajiKai.map((r) => r.kai);
        onajiHi = hi;
        zenHi = [...new Set(rL.map(hiNoKagi))];
      }
    }
  }
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
  const last = owatta[owatta.length - 1];
  const c = erabuCard(last);
  // 8便 K4：育てたカードが一人前になった回（doreNashi の印）は、「どれでも」を新しく出さない
  if (c === 'dore' && last.doreNashi) return [];
  return [{ card: c, kurikaeshi: null }];
}

// 持っているカード（4便）：回ごとに渡したカードがたまる。一度渡したカードは消えない。
// 同じカードをまた渡したときは、新しいほうの文にする。新しく増えたカードを前に出す。
// 見つけたカードのレベル（7便）：1＝その日の候補、2＝別々の日の2日で同じ向き、3＝3日以上で同じ向き。上限は3。
// どれでもカードは、差なしだった別々の日の数（上限3）。ためしたカードには、レベルを付けない。
// レベルは下がらない：回を足すたびに、前のレベルとの大きいほうを残す。
export const LEVEL_JOUGEN = 3;
function hiNoKazu(kaiList) {
  return new Set(kaiList.map((r) => r.hi || `回${r.kai}`)).size;
}
function cardNoLevel(g, mae) {
  if (g.card === 'tameshita') return null;
  if (g.card === 'dore') return Math.min(LEVEL_JOUGEN, hiNoKazu(mae.filter((r) => erabuCard(r) === 'dore')));
  if (g.kurikaeshi) return Math.min(LEVEL_JOUGEN, Math.max(2, (g.kurikaeshi.onajiHi || g.kurikaeshi.onaji).length));
  return 1;
}

export function motteiruCards(kaiList) {
  const owatta = kaiList.filter((r) => r.owari !== false);
  const held = new Map();
  let atarashii = [];
  let agatta = [];
  for (let i = 1; i <= Math.max(owatta.length, 1); i++) {
    const mae = owatta.slice(0, i);
    const last = mae[mae.length - 1];
    const ima = watasuCards(mae);
    const saigo = i === Math.max(owatta.length, 1);
    if (saigo) atarashii = ima.filter((g) => !held.has(g.card)).map((g) => g.card);
    ima.forEach((g, j) => {
      const moto = held.get(g.card);
      const lv = cardNoLevel(g, mae);
      const level = lv == null ? null : Math.max(lv, moto?.level ?? 0);
      if (saigo && moto && level != null && level > (moto.level ?? 0)) agatta.push(g.card);
      held.set(g.card, { ...g, kind: CARD_KIND[g.card] ?? null, level, kai: last?.kai ?? null, hi: last?.hi ?? null, jun: i * 10 - j });
    });
  }
  agatta = agatta.filter((c) => !atarashii.includes(c));
  // 全員に1枚以上（印のせいで1枚も無くなるときは、印を使わない。ふつうは起きない：一人前の前に見つけたカードがあるため）
  if (!held.size) return motteiruCards(owatta.map((r) => ({ ...r, doreNashi: false })));
  const cards = [...held.values()].sort((x, y) => (atarashii.includes(y.card) - atarashii.includes(x.card)) || y.jun - x.jun);
  return { cards, atarashii, agatta };
}

// いちばん前に出すカード（伝え方・仮説の予備の文が使う）
export function erabuCardKai(kaiList) {
  const { cards } = motteiruCards(kaiList);
  return { card: cards[0].card, kurikaeshi: cards[0].kurikaeshi };
}

// カードの文に、回の数を入れる（くり返しのときだけ）
// 「3日分のうち3日分で」のような重なりを避ける（6便）：すべての日なら「すべてで」と書く
export function nichiBun(zen, onaji) {
  return zen === onaji ? `${zen}日分のゲームのすべてで` : `${zen}日分のゲームのうち、${onaji}日分で`;
}

export function cardNoBun(card, kurikaeshi) {
  if (!kurikaeshi || !card.くり返しのとき) return card;
  const zen = kurikaeshi.zenkai;
  const onaji = (kurikaeshi.onajiHi || kurikaeshi.onaji).length;
  const ireru = (t) => t
    .replaceAll('{全日}日分のゲームのうち、{同じ日}日分で', nichiBun(zen, onaji))
    .replaceAll('そのうち{同じ日}日分で', zen === onaji ? 'そのすべての日で' : `そのうち${onaji}日分で`)
    .replaceAll('{全日}', String(zen))
    .replaceAll('{同じ日}', String(onaji));
  const k = card.くり返しのとき;
  return { ...card, ひとこと: ireru(k.ひとこと), これは何か: ireru(k.これは何か), 保護者向け: ireru(k.保護者向け), きょう: k.きょう || card.きょう };
}

export function kotaeD(record, tana) {
  // D5〜D8（自分で思う強み・7便）は、答えた記録があるときだけ出す（6便までの記録には無いため）
  return D_IDS.filter((id) => ['D1', 'D2', 'D3', 'D4'].includes(id) || record.kekka?.[id]).map((id) => ({ id, toi: tana.D.質問[id].問い, kotae: record.kekka?.[id]?.kotae ?? null }));
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

// ⑦ また見つける：前の回との違い（事実だけ。棚ごとに、前の回とこの回の結果を並べる）
function kekkaNoKotoba(m) {
  if (m.kekka === 'mada') return 'まだ比べていない';
  if (m.kekka === 'nashi') return '差なし';
  return `その回の候補「${DASHIKATA[m.kekka]}」`;
}
export function maeTonoChigai(kaiList) {
  const owatta = kaiList.filter((r) => r.owari !== false);
  if (owatta.length < 2) return [];
  const [mae, ima] = owatta.slice(-2);
  return ['A', 'B', 'C'].map((k) => {
    const a = matome(mae, k);
    const b = matome(ima, k);
    return { kind: k, mae: kekkaNoKotoba(a), ima: kekkaNoKotoba(b), kawatta: a.kekka !== b.kekka, dankai: [a.dankai, b.dankai] };
  });
}

// 案内の {…} に、学校の設定を入れる（7便）。子ども向けの文には {…} を置かない（時間を言い切らない）
const SETTEI_NO_IIKATA = {
  朝の練習の頻度: { 毎日: '毎日', 週2: '週2回', 週1: '週1回' },
  また見つけるの間隔: { 月1: '1か月', '2か月': '2か月', 学期: '学期' },
};
export function setteiWoIreru(bun, settei, tani = {}) {
  return String(bun).replace(/\{([^{}]+)\}/g, (m, k) => {
    if (!(k in settei)) return m;
    const v = settei[k];
    return SETTEI_NO_IIKATA[k]?.[v] ?? `${v}${tani[k] || ''}`;
  });
}
