// 比べ方・カード・Claude の書き直しの流れを確かめる（キーは使わない）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, seihon } from '../lib/kotoba.mjs';
import { askClaude } from '../lib/claude.mjs';
import { matomeA, matomePair, erabuCard, kouho, makeSteps, yobiNext, makeJunban } from '../public/js/kurabe.js';

const j = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const demo = j('public/data/demo.json');
const cards = j('public/data/cards.json');
let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log(`○ ${name}`); });

await ok('デモ1は「聞く」の候補、デモ2は差なし', () => {
  assert.equal(matomeA(demo.結果.デモ1).kekka, 'kiku');
  assert.equal(matomeA(demo.結果.デモ2).kekka, 'nashi');
  assert.equal(matomeA(demo.結果.デモ1).kakunin, 2);
});

const rec = (s, saisho = 'yomu') => ({ junban: { saisho, irekae: false, zu: 'B1', kugiri: 'C1' }, kekka: { 'A-1': { seikai: s[0] }, 'A-2': { seikai: s[1] }, 'A-3': { seikai: s[2] }, 'A-4': { seikai: s[3] } } });
await ok('候補は、揺れより大きい差が同じ向きに2回出たときだけ', () => {
  // 読む：A-1, A-4／聞く：A-2, A-3
  assert.equal(matomeA(rec([2, 4, 4, 2])).kekka, 'kiku'); // 差 +2,+2 揺れ0
  assert.equal(matomeA(rec([2, 4, 3, 2])).kekka, 'nashi'); // 差 +2,+1 揺れ1 → 1は揺れより大きくない
  assert.equal(matomeA(rec([3, 2, 2, 3])).kekka, 'yomu');
  assert.equal(matomeA(rec([2, 4, 2, 4])).kekka, 'nashi'); // 向きが逆
  assert.equal(matomeA(rec([3, 3, 3, 3])).kekka, 'nashi');
  assert.equal(matomeA({ junban: rec([0, 0, 0, 0]).junban, kekka: { 'A-1': { seikai: 2 } } }).kekka, 'mada');
});

await ok('練習は比べる数に入らない', () => {
  const r = rec([2, 4, 4, 2]);
  r.kekka['A-r1'] = { seikai: 0 };
  r.kekka['A-r2'] = { seikai: 4 };
  assert.equal(matomeA(r).kekka, 'kiku');
});

await ok('読み上げが使えなかった回は比べない', () => {
  const r = rec([2, 4, 4, 2]);
  r.kekka['A-2'].yomiageNashi = true;
  assert.equal(matomeA(r).kekka, 'mada');
});

await ok('図・区切りは1組だけなので決めない', () => {
  assert.equal(matomePair(demo.結果.デモ1, 'B').kekka, 'mada');
  assert.equal(matomePair(demo.結果.デモ1, 'C').kekka, 'mada');
});

await ok('どの結果でもカードは1枚で、強みのカード（この便で使うもの）', () => {
  for (let x = 0; x < 625; x++) {
    const s = [x % 5, Math.floor(x / 5) % 5, Math.floor(x / 25) % 5, Math.floor(x / 125) % 5];
    for (const saisho of ['yomu', 'kiku']) {
      const id = erabuCard(rec(s, saisho));
      assert.ok(cards.カード[id], id);
      assert.ok(!cards.カード[id]['この便では使わない'], id);
    }
  }
  assert.equal(erabuCard({ junban: rec([0, 0, 0, 0]).junban, kekka: {} }), 'tameshita');
});

await ok('練習が終わるまでは練習だけ。予備の順で最後まで行ける', () => {
  const r = { junban: makeJunban('テスト'), kekka: {} };
  assert.deepEqual(kouho(r), ['A-r1']);
  const jun = [];
  for (let i = 0; i < 20; i++) {
    const id = yobiNext(r);
    if (!id) break;
    jun.push(id);
    r.kekka[id] = { seikai: 1 };
  }
  assert.equal(jun.length, makeSteps(r.junban).length);
  // ABBA の順が守られている
  assert.deepEqual(jun.filter((x) => /^A-\d/.test(x)), ['A-1', 'A-2', 'A-3', 'A-4']);
});

// Claude の書き直し：偽の Claude を使う
const sakeru = seihon()['避ける言葉'][0]['言葉'];
function nisemono(kotaeList) {
  const okutta = [];
  return {
    okutta,
    beta: { messages: { create: async (req) => { okutta.push(req); const t = kotaeList[Math.min(okutta.length - 1, kotaeList.length - 1)]; return { stop_reason: 'end_turn', model: 'nise', content: [{ type: 'text', text: JSON.stringify(t) }] }; } } },
  };
}
const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };

await ok('避ける言葉が出たら書き直しを頼み、通った文だけを使う', async () => {
  const c = nisemono([{ a: `この子は${sakeru}です` }, { a: '聞いて答えるとき、力が出ているかも。' }]);
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, true);
  assert.equal(r.kaisu, 2);
  assert.match(c.okutta[1].messages[0].content, /書き直してください/);
  assert.equal(c.okutta[0].fallbacks, 'default');
  assert.ok(c.okutta[0].system.includes(sakeru), '決まりが Claude に渡っている');
});

await ok('書き直しても残るときは使わない（予備の動きへ）', async () => {
  const c = nisemono([{ a: `${sakeru}` }]);
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, false);
  assert.equal(c.okutta.length, 3);
});

console.log(`\n${n} 件の確かめが通りました。`);
