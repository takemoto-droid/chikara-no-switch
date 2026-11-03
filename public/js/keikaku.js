// 期間の計画（06 第3.1版 6章の役割4）：学校の設定とクラスの結果から、誰に・どの棚・どの段・何日を書く。
// 参考程度・決めるのは先生。キーが無いあいだは、ここの決まった計画（予備）を出す。
// Claude には名前も呼び名も送らない。「子1」「子2」のような仮の番号だけを送る。
import { motteiruCards } from './kurabe.js';
import { sodateKouho, jibunDeErabu, danWoDasu, renshuNoHi, SODATE_MEI, DAN_NO_DASHIKATA, TANA_OF, hitotsuNoKazu } from './sodateru.js';

const SHUU = { 毎日: 5, 週2: 2, 週1: 1 };
const KIKAN_SHUU = { 月1: 4, '2か月': 8, 学期: 12 };
const TANA_NO_NAMAE = { A: '読む／聞く', B: '文で見る／図で見る', C: '一気に／区切って' };

// その子の、計画に使う形（名前は入れない）
export function keikakuNoKo(label, kaiList, renshu) {
  const owatta = (kaiList || []).filter((r) => r.owari !== false);
  const { cards } = motteiruCards(owatta);
  const kouho = owatta.length ? sodateKouho(owatta) : null;
  const jibun = jibunDeErabu(renshu);
  const modes = kouho || (jibun ? [jibun] : []);
  return {
    label,
    kaisu: owatta.length,
    mitsuketa: cards.filter((c) => !['dore', 'tameshita'].includes(c.card)).map((c) => ({ card: c.card, level: c.level })),
    sodate: modes.map((m) => ({ mode: m, dan: danWoDasu(renshu, m).dan, hi: renshuNoHi(renshu, m).length })),
    jibun: Boolean(!kouho && jibun),
  };
}

export function kikanNoHi(settei) {
  return (SHUU[settei.朝の練習の頻度] ?? 2) * (KIKAN_SHUU[settei.また見つけるの間隔] ?? 8);
}

// 決まった計画（予備）
export function yobiKeikaku(settei, kodomo) {
  const hi = kikanNoHi(settei);
  const n = hitotsuNoKazu(settei.朝の練習の長さ);
  const ko = kodomo.map((k) => {
    if (!k.kaisu) return { label: k.label, bun: 'まだゲーム（② 見つける）をしていません。はじめに HR でゲームをします。' };
    if (!k.sodate.length) return { label: k.label, bun: `出し方の差は、まだ見つかっていません。朝の練習は、本人が選んだ出し方で（本人の好み）。次の「また見つける」（${settei.また見つけるの間隔}ごと・${settei.また見つけるの長さ}分ほど）で、もう一度確かめます。` };
    const s = k.sodate.map((x) => `「${SODATE_MEI[x.mode]}」（棚：${TANA_NO_NAMAE[TANA_OF[x.mode]]}）を、いまの段「${DAN_NO_DASHIKATA[x.mode][x.dan - 1]}」から`).join('、');
    const jibun = k.jibun ? '本人が選んだ出し方です（本人の好み）。' : '';
    return { label: k.label, bun: `${jibun}朝の練習：${s}。${settei.朝の練習の頻度}・1回${settei.朝の練習の長さ}分（練習のひとつを${n}つ）、次の「また見つける」までに${hi}日ほど。段が進むかどうかは練習の中の事実で決まるので、ここでは決めません。` };
  });
  const zentai = `学校の設定（朝の練習 ${settei.朝の練習の頻度}・1回${settei.朝の練習の長さ}分、また見つける ${settei.また見つけるの間隔}ごと・${settei.また見つけるの長さ}分ほど）から、次の「また見つける」までの計画の案です。練習の日は${hi}日ほどです。「今日はやらない」を選ぶ日もあるので、日数は目安です。`;
  return { zentai, ko };
}
