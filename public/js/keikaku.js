// 期間の計画（06 第3.1版 6章の役割4）：学校の設定とクラスの結果から、誰に・どの棚・どの段・何日を書く。
// 参考程度・決めるのは先生。キーが無いあいだは、ここの決まった計画（予備）を出す。
// Claude には名前も呼び名も送らない。「子1」「子2」のような仮の番号だけを送る。
import { motteiruCards } from './kurabe.js';
import { sodateKouho, jibunDeErabu, danWoDasu, renshuNoHi, ichininmaeOf, SODATE_MEI, DAN_NO_DASHIKATA, DAN_JOUGEN, TANA_OF, hitotsuNoKazu } from './sodateru.js';

const SHUU = { 毎日: 5, 週2: 2, 週1: 1 };
const KIKAN_SHUU = { 月1: 4, '2か月': 8, 学期: 12 };
const TANA_NO_NAMAE = { A: '読む／聞く', B: '文で見る／図で見る', C: '一気に／区切って' };

// その子の、計画に使う形（名前は入れない）
// 10便 M1：回の種類（② 見つける＝HR のゲーム／⑦ また見つける＝短いゲーム）と、その回数を分けて渡す。
// 育てる出し方には「一人前か」を付ける（一人前の出し方は練習が終わっているので、続ける案を書かない）
export function keikakuNoKo(label, kaiList, renshu) {
  const owatta = (kaiList || []).filter((r) => r.owari !== false);
  const { cards } = motteiruCards(owatta);
  const kouho = owatta.length ? sodateKouho(owatta) : null;
  const jibun = jibunDeErabu(renshu);
  const modes = kouho || (jibun ? [jibun] : []);
  const ichi = ichininmaeOf(owatta, renshu);
  const gameKaisu = owatta.filter((r) => r.shurui !== 'mijikai').length;
  const mataKaisu = owatta.filter((r) => r.shurui === 'mijikai').length;
  return {
    label,
    kaisu: owatta.length,
    gameKaisu,
    mataKaisu,
    mitsuketa: cards.filter((c) => !['dore', 'tameshita'].includes(c.card)).map((c) => ({ card: c.card, level: c.level })),
    sodate: modes.map((m) => {
      const { dan } = danWoDasu(renshu, m);
      return { mode: m, dan, hi: renshuNoHi(renshu, m).length, ichininmae: dan >= DAN_JOUGEN || ichi.includes(m) };
    }),
    jibun: Boolean(!kouho && jibun),
  };
}

// その子がしたこと（回の種類と回数）を、取り違えない言い方で
export function shitaKoto(k) {
  const game = k.gameKaisu ?? k.kaisu ?? 0;
  const mata = k.mataKaisu ?? 0;
  return `② 見つける（HR のゲーム）を${game}回${mata ? `、⑦ また見つける（短いゲーム）を${mata}回` : '。⑦ また見つける（短いゲーム）は、まだしていない'}`;
}

export function kikanNoHi(settei) {
  return (SHUU[settei.朝の練習の頻度] ?? 2) * (KIKAN_SHUU[settei.また見つけるの間隔] ?? 8);
}

// 決まった計画（予備）。Claude への頼み方と同じ言葉づかいにする（10便 M1）
export function yobiKeikaku(settei, kodomo) {
  const hi = kikanNoHi(settei);
  const n = hitotsuNoKazu(settei.朝の練習の長さ);
  const mata = `次の「また見つける」（${settei.また見つけるの間隔}ごと・${settei.また見つけるの長さ}分ほど）`;
  const ko = kodomo.map((k) => {
    const shita = `したこと：${shitaKoto(k)}。`;
    if (!k.kaisu) return { label: k.label, bun: 'まだゲーム（② 見つける）をしていません。はじめに HR でゲームをします。' };
    if (!k.sodate.length) return { label: k.label, bun: `${shita}出し方の差は、まだ見つかっていません。朝の練習は、本人が選んだ出し方で（本人の好み）。${mata}で、もう一度確かめます。` };
    const owari = k.sodate.filter((x) => x.ichininmae);
    const tsuzuku = k.sodate.filter((x) => !x.ichininmae);
    const ichi = owari.length ? `「${owari.map((x) => SODATE_MEI[x.mode]).join('」「')}」は一人前（段${DAN_JOUGEN}・上限）で、この出し方の練習は終わっています。次に育てる出し方は先生が決めます。` : '';
    const jibun = k.jibun ? '本人が選んだ出し方です（本人の好み）。' : '';
    if (!tsuzuku.length) return { label: k.label, bun: `${shita}${jibun}${ichi}${mata}で、出し方の差をもう一度確かめます。` };
    const s = tsuzuku.map((x) => `「${SODATE_MEI[x.mode]}」（棚：${TANA_NO_NAMAE[TANA_OF[x.mode]]}）を、いまの段「${DAN_NO_DASHIKATA[x.mode][x.dan - 1]}」から`).join('、');
    return { label: k.label, bun: `${shita}${jibun}${ichi}朝の練習：${s}。${settei.朝の練習の頻度}・1回${settei.朝の練習の長さ}分（練習のひとつを${n}つ）、次の「また見つける」までに${hi}日ほど。段が進むかどうかは練習の中の事実で決まるので、ここでは決めません。` };
  });
  const zentai = `学校の設定（朝の練習 ${settei.朝の練習の頻度}・1回${settei.朝の練習の長さ}分、また見つける ${settei.また見つけるの間隔}ごと・${settei.また見つけるの長さ}分ほど）から、次の「また見つける」までの計画の案です。練習の日は${hi}日ほどです。「今日はやらない」を選ぶ日もあるので、日数は目安です。「② 見つける」は HR のゲーム、「⑦ また見つける」は間隔をあけてする短いゲームです。`;
  return { zentai, ko };
}
