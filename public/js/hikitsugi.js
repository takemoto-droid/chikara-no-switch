// 引き継ぎの記録の書き出し（Should・5便）
// 先生の間の引き継ぎのために、回ごとの「出し方の差」と、くり返し出た候補・カード・選んだ答え・気づきの候補を、
// 年をまたいでも並べて見られる形（Markdown の表）で書き出す。名前は入れない（呼び名だけ）。
import { matomeKai, motteiruCards, cardNoBun, levelNoNamae, kotaeD, DASHIKATA, TANA_MEI } from './kurabe.js';

export function hikitsugiNoBun({ id, kai, cards, tana, atehamaru, kakuHi }) {
  const owatta = kai.filter((r) => r.owari !== false);
  const L = [];
  L.push(`# 引き継ぎの記録（${id}）`);
  L.push('');
  L.push(`書き出した日：${kakuHi}　／　チカラのスイッチ`);
  L.push('');
  L.push('> 本人の中で、出し方を比べた結果です。他の子とは比べていません。決めるのは先生です。参考程度にしてください。');
  L.push('');
  L.push('## 回ごとの「出し方の差」');
  L.push('');
  L.push('| 回 | 日付 | 年度 | ' + ['A', 'B', 'C'].map((k) => TANA_MEI[k]).join(' | ') + ' |');
  L.push('|---|---|---|---|---|---|');
  const x3 = ['A', 'B', 'C'].map((k) => matomeKai(owatta, k));
  owatta.forEach((r, i) => {
    const hi = r.hi || '日付なし';
    const nendo = r.hi ? nendoOf(r.hi) : '—';
    const cells = x3.map((x) => {
      const row = x.rows[i];
      if (!row || row.sa.length < 2) return 'まだ比べていない';
      return `${row.muki ? DASHIKATA[row.muki] : '向きなし'}（差 ${row.sa.map((n) => `${n > 0 ? '+' : ''}${n}`).join('・')}${row.ookii ? '・その回の候補' : ''}）`;
    });
    L.push(`| ${r.kai ?? i + 1}回目 | ${hi} | ${nendo} | ${cells.join(' | ')} |`);
  });
  L.push('');
  L.push('## くり返し出た候補（別々の日に、同じ向きの差）');
  L.push('');
  for (const x of x3) {
    L.push(`- ${TANA_MEI[x.kind]}：${x.kurikaeshi ? `「${DASHIKATA[x.kurikaeshi]}」（別々の日 ${x.zenHi.length}日のうち ${x.onajiHi.length}日）` : 'なし'}`);
  }
  L.push('');
  L.push('## 本人が持っているカード');
  L.push('');
  for (const m of motteiruCards(owatta).cards) {
    const c = cardNoBun(cards.カード[m.card], m.kurikaeshi);
    const lv = levelNoNamae(cards, m);
    L.push(`- ${c.名前}${lv ? `（レベル：${lv}）` : ''}：${c.ひとこと}（${m.kai ?? ''}回目のゲームのあとで）`);
  }
  L.push('');
  L.push('## 選んで答えた質問（回ごと）');
  L.push('');
  owatta.forEach((r, i) => {
    L.push(`- ${r.kai ?? i + 1}回目（${r.hi || '日付なし'}）：${kotaeD(r, tana).map((d) => `「${d.toi}」→「${d.kotae ?? '答えていない'}」`).join('、')}`);
  });
  L.push('');
  L.push('## チェック項目で当てはまったもの（気づきの候補）');
  L.push('');
  if (atehamaru.length) atehamaru.forEach((t) => L.push(`- ${t}`));
  else L.push('- まだありません');
  L.push('');
  L.push('## 次の先生へ');
  L.push('');
  L.push('- 授業で試した工夫と、そのときの様子を、この下に書き足してください。');
  L.push('');
  return L.join('\n');
}

// 4月はじまりの年度
export function nendoOf(hi) {
  const [y, m] = hi.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}年度`;
}
