// 予備の動き：API キーが無いとき・Claude が使えないとき・上限に達したときに出す、決まった文
// どの文も言葉の正本で点検する（scripts/tenken.mjs）
import { matomeA, matomePair, kotaeD, DASHIKATA } from '../public/js/kurabe.js';

export const SANKOU = '参考程度・決めるのは先生';

function nanmon(arr, kazu) {
  return arr.length ? arr.map((n) => `${n}問`).join('・') + `（各${kazu}問）` : 'まだ無し';
}

export function konkyoList(record, tana, atehamaru) {
  const a = matomeA(record);
  const b = matomePair(record, 'B');
  const c = matomePair(record, 'C');
  const out = [
    `読む：${nanmon(a.yomu, a.kazu)}`,
    `聞く：${nanmon(a.kiku, a.kazu)}`,
    a.yure == null ? '同じ出し方での揺れ：まだ2回そろっていない' : `同じ出し方を2回やったときの揺れ：${a.yure}問`,
  ];
  if (b.kakunin) out.push(`図を添える：${b.zu}問／文だけ：${b.bun}問（各1問・1組だけなので、まだ決めない）`);
  if (c.kakunin) out.push(`区切る：${c.kugiri}問／続けて書く：${c.tsuzuke}問（各4問・1組だけなので、まだ決めない）`);
  for (const d of kotaeD(record, tana)) {
    if (d.kotae) out.push(`選んだ答え：「${d.toi}」→「${d.kotae}」`);
  }
  if (atehamaru?.length) out.push(`チェック項目の気づきの候補：${atehamaru.map((t) => `「${t}」`).join('、')}`);
  return out;
}

export function yobiKasetsu(record, tana, atehamaru) {
  const a = matomeA(record);
  const k = {
    kiku: {
      kasetsu: '問題文を聞いて答えるとき、力が出ているかも。',
      tsugi: '次に試すなら、授業の小テストで問題文を読み上げる出し方を、何回か続けて試す。',
    },
    yomu: {
      kasetsu: '自分のペースで読んで答えるとき、力が出ているかも。',
      tsugi: '次に試すなら、口で伝えた指示を、黒板かプリントにも書いて出す。',
    },
    nashi: {
      kasetsu: '読む・聞くのどちらの出し方でも、同じくらい力が出ているかも。',
      tsugi: '次に試すなら、図を添える出し方と区切る出し方を、もう1組ずつ試して確かめる。',
    },
    mada: {
      kasetsu: 'まだ比べた回数がそろっていないので、どの出し方のとき力が出ているかは、言えないかも。',
      tsugi: '次に試すなら、読む・聞くの組を、もう一度最後まで試す。',
    },
  }[a.kekka];
  return { ...k, konkyo: konkyoList(record, tana, atehamaru) };
}

export function yobiTsutae(record, cards, cardId) {
  const a = matomeA(record);
  const card = cards.カード[cardId];
  const kondan = {
    kiku: 'ゲームで、同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。2回とも、聞いて答えたときのほうが正解が多くありました。授業では、問題文を読み上げる工夫を、しばらく試してみようと考えています。ご家庭で気づいたことがあれば、教えてください。1回のゲームの結果なので、決めつけずに続けて様子を見ます。',
    yomu: 'ゲームで、同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。2回とも、自分のペースで読んで答えたときのほうが正解が多くありました。授業では、口で伝えたことを黒板にも書く工夫を、しばらく試してみようと考えています。ご家庭で気づいたことがあれば、教えてください。1回のゲームの結果なので、決めつけずに続けて様子を見ます。',
    nashi: 'ゲームで、同じ難しさの問題を、読む出し方と聞く出し方で2回ずつ解きました。どちらの出し方でも、同じくらい力を出せていました。差が出ないのも、よくある結果です。次の回では、図を添える出し方なども試してみます。ご家庭で気づいたことがあれば、教えてください。',
    mada: 'ゲームで、いろいろな出し方の問題に最後まで取り組みました。どの出し方で力を出しやすいかは、次の回で確かめます。ご家庭で気づいたことがあれば、教えてください。',
  }[a.kekka];
  return { kondan, hogosha: card.保護者向け, cardMei: card.名前 };
}

export function yobiNextLabel(stepId, st) {
  if (!st) return stepId;
  if (st.kind === 'D') return `選んで答える質問 ${stepId}`;
  return `${st.kind}の課題（${DASHIKATA[st.mode]}）${st.renshu ? '・練習' : ''}`;
}
