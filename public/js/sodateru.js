// ⑥ 育てる（朝の練習）のしくみ。画面は持たない（確かめのスクリプトからも使う）。
// 06 第3.1版 3-2：得意な出し方を支えにして、もう一方の出し方を、支えを少しずつ減らしながら練習する（足場かけ → 足場外し）。
// 段が上がるのは、練習の中の事実だけ。下がらない。段4で一人前。
import { motteiruCards, matome, kaiNoMuki } from './kurabe.js';

// 見つけたカード → 育てる出し方（区切っては練習しない：もともと支えのある形のため）
export const SODATE_OF = { kiku: 'yomu', yomu: 'kiku', zu: 'bun', kugiru: 'ikki' };
// 育てる出し方 → 支えにする出し方・棚
export const SASAE_OF = { yomu: 'kiku', kiku: 'yomu', bun: 'zu', zu: 'bun', ikki: 'kugiri' };
export const TANA_OF = { yomu: 'A', kiku: 'A', bun: 'B', zu: 'B', ikki: 'C' };
export const SODATE_MODES = ['yomu', 'kiku', 'bun', 'zu', 'ikki'];
export const DAN_JOUGEN = 4;

// 子どもに見せる出し方の名前（「苦手」の言葉は使わない）
export const SODATE_MEI = { yomu: '自分で読む', kiku: '聞く', bun: '文だけで場面をつかむ', zu: '図だけで場面をつかむ', ikki: '連絡をまとめて読む' };

// 段ごとの出し方（06 3-2 の表。子どもにも先生にも出す）
export const DAN_NO_DASHIKATA = {
  yomu: ['聞きながら読む（文も見える）', '前半だけ聞いて、あとは読む', '聞きたいときだけ「聞く」を押す', '読むだけ'],
  kiku: ['読みながら聞く（文も見える）', '後半だけ文が見える', '見たいときだけ「文を見る」を押す', '聞くだけ'],
  bun: ['文と図', '文と、名前の無い図の枠', '文だけ（図をかく枠つき）', '文だけ'],
  zu: ['図と文', '図と、文の大事なところだけ', '図と「言葉で言うと？」', '図だけ'],
  ikki: ['一文ずつ', '二文ずつ', '全部の文（番号つき・一文ずつ改行）', '全部の文（ひとまとまり）'],
};

// 「正解が多い」：そのひとつの問いの 3分の2 以上が正解
export const OOI = 2 / 3;
// 段3 の「押したときだけ」のボタン：段4 に上がるには、押した回数が2回以下（06 3-2）
export const OSHITA_JOUGEN = 2;
export function ookattaKa(h) {
  if (!h || !h.kazu) return false;
  if (h.yomiageNashi) return false; // 読み上げが使えなかったひとつは、段を進める数に入れない
  if (h.seikai / h.kazu < OOI) return false;
  if (h.dan === 3 && (h.mode === 'yomu' || h.mode === 'kiku') && (h.oshita ?? 0) > OSHITA_JOUGEN) return false;
  return true;
}

// 練習の記録（renshu：日ごとの練習の並び）から、その出し方のいまの段を出す。
// 決まり：同じ段で「正解が多い」ひとつが2回続いたら、次の段へ。下がらない。段4 が上限。
export function danWoDasu(renshu, mode) {
  let dan = 1;
  let tsuzuki = 0;
  const agari = [];
  let kaisu = 0;
  for (const r of renshu || []) {
    for (const h of r.hitotsu || []) {
      if (h.mode !== mode) continue;
      kaisu++;
      if (h.dan !== dan) continue; // 段が変わる前のひとつ（記録の順の都合）は数えない
      tsuzuki = ookattaKa(h) ? tsuzuki + 1 : 0;
      if (tsuzuki >= 2 && dan < DAN_JOUGEN) {
        agari.push({ kara: dan, made: dan + 1, hi: r.hi });
        dan++;
        tsuzuki = 0;
      }
    }
  }
  return { dan, tsuzuki, agari, kaisu };
}

// 練習した日（「今日はやらない」の日は入れない）
export function renshuNoHi(renshu, mode) {
  return [...new Set((renshu || []).filter((r) => !r.yasumi && (r.hitotsu || []).some((h) => h.mode === mode)).map((r) => r.hi))];
}

// 育てる出し方の候補：持っている見つけたカードから。無ければ null（本人が選ぶ）
export function sodateKouho(kaiList) {
  const { cards } = motteiruCards(kaiList);
  const m = [...new Set(cards.map((c) => SODATE_OF[c.card]).filter(Boolean))];
  return m.length ? m : null;
}

// 本人が選んだ出し方（どれでも・ためしたの子）。記録は「本人の好み」として先生に出す
export function jibunDeErabu(renshu) {
  const r = [...(renshu || [])].reverse().find((x) => x.jibun);
  return r ? r.jibun : null;
}

// その出し方の練習で使う、難しさの段階（いちばん新しい HR の、その棚の最後の段階）。子どもには出さない
export function renshuNoDankai(kaiList, mode) {
  const owatta = (kaiList || []).filter((r) => r.owari !== false);
  const last = owatta[owatta.length - 1];
  if (!last) return 2;
  return matome(last, TANA_OF[mode]).dankai === 1 ? 1 : 2;
}

// 1回の練習のひとつの数（設定の長さから。ひとつ2〜3分）
export function hitotsuNoKazu(fun) {
  return Math.max(1, Math.floor((Number(fun) || 10) / 2.5));
}

// 今日の出し方を、決まった順で選ぶ（予備の動き）：練習した日がいちばん少ない出し方。同じなら候補の順
export function yobiKyou(kouho, renshu) {
  const c = [...kouho].sort((x, y) => renshuNoHi(renshu, x).length - renshuNoHi(renshu, y).length);
  return c[0];
}

// 今日の練習の理由（子どもの画面に出す・12便 P2 で20字ほどに短くした。「段」と言わない）
export function kyouNoRiyuuWoKaku(hi, tsuzuki, dan) {
  if (hi === 0) return 'はじめての 練習。';
  if (tsuzuki === 1 && dan < DAN_JOUGEN) return '前回は 正解が多かった。もう一回。';
  return `${hi + 1}日目の 練習。`;
}
export function kyouNoRiyuu(mode, renshu) {
  const { dan, tsuzuki } = danWoDasu(renshu, mode);
  return kyouNoRiyuuWoKaku(renshuNoHi(renshu, mode).length, tsuzuki, dan);
}

// 段が進んだときの理由（決まった文。Claude ではなく、練習の中の事実だけ）
// 12便 P2：子どもの画面に出すので短く（やり方の名前は、画面の側で別に出す）
export function agariNoRiyuu() {
  return '2回 続けて、正解が 多かったから。';
}

// 練習で使う文章・場面を選ぶ：その段階の中で、使った回数がいちばん少ないもの（同じなら並びの順）。前と同じものは避ける
export function erabuMondai(pool, mode, dankai, renshu) {
  const tana = TANA_OF[mode];
  const list = (tana === 'B' ? pool.B.問題 : pool[tana].文章).filter((x) => x.段階 === dankai);
  const tsukatta = {};
  let mae = null;
  for (const r of renshu || []) for (const h of r.hitotsu || []) if (TANA_OF[h.mode] === tana) { tsukatta[h.mondai] = (tsukatta[h.mondai] || 0) + 1; mae = h.mondai; }
  const c = list.filter((x) => x.id !== mae);
  const kouho = (c.length ? c : list).slice().sort((x, y) => (tsukatta[x.id] || 0) - (tsukatta[y.id] || 0));
  return kouho[0];
}

// 育てるカード：練習を始めた出し方ごとに1枚（そだてちゅう）。レベル＝段。段4 で一人前。
// ⑦ また見つける で差が縮んだ出し方（ichininmae に入っている）も一人前にする。
// ⑦ また見つける：練習を始めた日より後の日のゲームで、その棚の「支えの出し方」の差が出なくなった（差なし）出し方。
// 練習を始める前に支えの出し方の候補が出ていて、後の日に、その棚を比べられて（まだ でない）、差なし か 育てた出し方の向き のとき。
export function ichininmaeOf(kaiList, renshu) {
  return [...new Set(ichininmaeNoKai(kaiList, renshu).map((x) => x.mode))];
}

// 一人前になった回（8便 K4）：練習を始めた後の日で、支えの出し方の差が出なくなった回。
// この回では「どれでも」を新しいカードとして出さない（「見つからないとき」の札と、育てた結果が重ならないように）
export function ichininmaeNoKai(kaiList, renshu) {
  const owatta = (kaiList || []).filter((r) => r.owari !== false);
  const out = [];
  for (const m of SODATE_MODES) {
    const hi = renshuNoHi(renshu, m).sort();
    if (!hi.length) continue;
    const kind = TANA_OF[m];
    const sasae = SASAE_OF[m];
    const mae = owatta.filter((r) => (r.hi || '') <= hi[0]);
    const ato = owatta.filter((r) => (r.hi || '') > hi[0]);
    const maeNiAtta = mae.some((r) => matome(r, kind).kekka === sasae);
    if (!maeNiAtta) continue;
    for (const r of ato) {
      const x = matome(r, kind);
      if (x.kekka !== 'mada' && x.kekka !== sasae && kaiNoMuki(x) !== sasae) out.push({ mode: m, kai: r.kai });
    }
  }
  return out;
}

// 回の記録に「この回は どれでも を出さない」の印を付ける（kiroku.js が読みこむときに使う）
export function doreNashiWoTsukeru(kaiList, renshu) {
  const kai = new Set(ichininmaeNoKai(kaiList, renshu).map((x) => x.kai));
  return kaiList.map((r) => (kai.has(r.kai) ? { ...r, doreNashi: true } : r));
}

// 育てるカードの文：練習で段4 まで来たら「育てたとき」、⑦ で差が出なくなったら「また見つけたとき」、それまでは「そだてちゅう」。
// 名前と色はそのカードのもの
export function sodateCardNoBun(cards, m) {
  const c = cards.カード[m.card];
  const bun = m.kara === 'renshu' ? c.育てたとき : m.kara === 'hr' ? c.また見つけたとき : cards.そだてちゅう;
  return { ...c, ...bun, 名前: c.名前, 色: c.色 };
}

export function sodateCards(renshu, ichininmae = []) {
  const modes = SODATE_MODES.filter((m) => (renshu || []).some((r) => (r.hitotsu || []).some((h) => h.mode === m)));
  for (const m of ichininmae) if (!modes.includes(m)) modes.push(m);
  return modes.map((m) => {
    const { dan } = danWoDasu(renshu, m);
    const kara = dan >= DAN_JOUGEN ? 'renshu' : ichininmae.includes(m) ? 'hr' : null;
    return { card: m, sodate: true, level: kara ? DAN_JOUGEN : dan, ichininmae: Boolean(kara), kara };
  });
}

// ---- 12便 P4（Should）：⑥ の「図を触る」。文・図の練習の段1〜2で、問いの前に、名前や物をタップで図の枠に置く。
// 枠がそろう場面（座席・棚）だけ。正解の数には入れず、段が進む決まりも変えない。直した回数は、先生の画面に事実としてだけ出す
export function sawaruNoMasu(z) {
  const rows = z?.type === 'seki' ? z.retsu : z?.type === 'tana' ? z.tana : null;
  if (!rows) return null;
  const masu = [];
  rows.forEach((r, i) => r.forEach((n, j) => masu.push({ i, j, kotae: n })));
  return { rows: rows.length, cols: Math.max(...rows.map((r) => r.length)), masu };
}
export function sawaruTaishou(mode, dan, z) {
  return (mode === 'bun' || mode === 'zu') && dan <= 2 && Boolean(sawaruNoMasu(z));
}
// 置いた結果：okareta は「i-j」→ 名前。atta は正しく置けた数
export function sawaruNoKekka(z, okareta, naoshi) {
  const m = sawaruNoMasu(z);
  const ireru = m.masu.filter((x) => x.kotae != null);
  const atta = ireru.filter((x) => okareta[`${x.i}-${x.j}`] === x.kotae).length;
  return { kazu: ireru.length, atta, naoshi };
}

