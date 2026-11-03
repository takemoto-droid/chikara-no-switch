// 予備の動き：API キーが無いとき・Claude が使えないとき・上限に達したときに出す、決まった文
// どの文も言葉の正本で点検する（scripts/tenken.mjs）
import { matome, matomeKai, kotaeD, erabuCardKai, cardNoBun, DASHIKATA, TANA_MEI } from '../public/js/kurabe.js';

export const SANKOU = '参考程度・決めるのは先生';

function nanmon(arr, kazu) {
  return arr.length ? arr.map((n) => `${n}問`).join('・') + `（各${kazu}問）` : 'まだ無し';
}

// kaiList：その子の終わった回の並び（いちばん新しい回が最後）
export function konkyoList(kaiList, tana, atehamaru) {
  const record = kaiList[kaiList.length - 1];
  const out = [];
  if (kaiList.length > 1) {
    for (const kind of ['A', 'B', 'C']) {
      const x = matomeKai(kaiList, kind);
      const kaigoto = x.rows.map((r) => `${r.kai}回目 ${r.muki ? DASHIKATA[r.muki] : '向きなし'}${r.ookii ? '（揺れより大きい）' : ''}`).join('、');
      out.push(`${TANA_MEI[kind]}・回ごとの差の向き：${kaigoto}${x.kurikaeshi ? `→ くり返し出た候補「${DASHIKATA[x.kurikaeshi]}」` : ''}`);
    }
  }
  for (const kind of ['A', 'B', 'C']) {
    const m = matome(record, kind);
    const [m1, m2] = m.kumi;
    const yure = m.yure == null ? '揺れはまだ出せない' : `同じ出し方での揺れ ${m.yure}問`;
    out.push(`${kaiList.length > 1 ? `${record.kai ?? kaiList.length}回目・` : ''}${TANA_MEI[kind]}：${DASHIKATA[m1]} ${nanmon(m[m1], m.kazu)}／${DASHIKATA[m2]} ${nanmon(m[m2], m.kazu)}（${yure}）`);
  }
  for (const d of kotaeD(record, tana)) {
    if (d.kotae) out.push(`選んだ答え：「${d.toi}」→「${d.kotae}」`);
  }
  if (atehamaru?.length) out.push(`チェック項目の気づきの候補：${atehamaru.map((t) => `「${t}」`).join('、')}`);
  return out;
}

const KASETSU = {
  kiku: { kasetsu: '問題文を聞いて答えるとき、力が出ているかも。', tsugi: '次に試すなら、授業の小テストで問題文を読み上げる出し方を、何回か続けて試す。' },
  yomu: { kasetsu: '自分のペースで読んで答えるとき、力が出ているかも。', tsugi: '次に試すなら、口で伝えた指示を、黒板かプリントにも書いて出す。' },
  zu: { kasetsu: '図で見る問題のとき、力が出ているかも。', tsugi: '次に試すなら、文章題に図を1つ添えて出す出し方を、何回か続けて試す。' },
  kugiru: { kasetsu: '長めの指示を一文ずつ区切って出したとき、力が出ているかも。', tsugi: '次に試すなら、授業の指示を一つずつ区切って伝え、1つ終わってから次を言う。' },
  dore: { kasetsu: '読む・聞くのどちらの出し方でも、同じくらい力が出ているかも。', tsugi: '次に試すなら、別の月にもう一度ゲームをして、同じ結果になるかを確かめる。' },
  tameshita: { kasetsu: 'まだ比べた回数がそろっていないので、どの出し方のとき力が出ているかは、言えないかも。', tsugi: '次に試すなら、そろっていない組を、もう一度最後まで試す。' },
};

const KURIKAESHI_KASETSU = {
  kiku: '問題文を聞いて答えるとき',
  yomu: '自分のペースで読んで答えるとき',
  zu: '図で見る問題のとき',
  kugiru: '長めの指示を一文ずつ区切って出したとき',
};

export function yobiKasetsu(kaiList, tana, atehamaru) {
  const { card, kurikaeshi } = erabuCardKai(kaiList);
  const k = { ...KASETSU[card] };
  if (kurikaeshi) k.kasetsu = `これまでに別々の日にした${kurikaeshi.zenkai}日分のゲームのうち、${kurikaeshi.onajiHi.length}日分で同じ向きの差が出たので、${KURIKAESHI_KASETSU[card]}、力が出ているかも。`;
  return { ...k, konkyo: konkyoList(kaiList, tana, atehamaru) };
}

const KONDAN = {
  kiku: '同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。2回とも、聞いて答えたときのほうが正解が多くありました。授業では、問題文を読み上げる工夫を、しばらく試してみようと考えています。',
  yomu: '同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。2回とも、自分のペースで読んで答えたときのほうが正解が多くありました。授業では、口で伝えたことを黒板にも書く工夫を、しばらく試してみようと考えています。',
  zu: '同じ場面の問題を、文だけで見る出し方と図つきで見る出し方で2回ずつ解きました。2回とも、図で見たときのほうが正解が多くありました。授業では、文章題に図を添える工夫を、しばらく試してみようと考えています。',
  kugiru: '長めの指示を、一気に出す出し方と一文ずつ区切って出す出し方で2回ずつ試しました。2回とも、区切って出したときのほうが正解が多くありました。授業では、指示を一つずつ区切って伝える工夫を、しばらく試してみようと考えています。',
  dore: '同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。どちらの出し方でも、同じくらい力を出せていました。差が出ないのも、よくある結果です。次の回では、別の出し方も試してみます。',
  tameshita: 'いろいろな出し方の問題に、最後まで取り組みました。どの出し方で力を出しやすいかは、次の回で確かめます。',
};

export function yobiTsutae(kaiList, cards) {
  const { card: cardId, kurikaeshi } = erabuCardKai(kaiList);
  const card = cardNoBun(cards.カード[cardId], kurikaeshi);
  const kondan = kurikaeshi
    ? `${card.保護者向け}授業では、この出し方を、しばらく試してみようと考えています。ご家庭で気づいたことがあれば、教えてください。`
    : kaiList.length > 1
      ? `これまでの${kaiList.length}回のゲームでは、同じ向きの差が別々の日にくり返し出た出し方は、まだありません。いちばん新しい日のゲームで、${KONDAN[cardId]}ご家庭で気づいたことがあれば、教えてください。決めつけずに、続けて様子を見ます。`
      : `この日のゲームで、${KONDAN[cardId]}ご家庭で気づいたことがあれば、教えてください。1回のゲームの結果なので、決めつけずに続けて様子を見ます。`;
  return { kondan, hogosha: card.保護者向け, cardMei: card.名前 };
}

export function yobiNextLabel(stepId, st) {
  if (!st) return stepId;
  if (st.kind === 'D') return `選んで答える質問 ${stepId}`;
  return `${st.kind}の課題（${DASHIKATA[st.mode]}）${st.renshu ? '・練習' : ''}`;
}
