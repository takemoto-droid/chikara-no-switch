// 比べ方・カード・Claude の書き直しの流れを確かめる（キーは使わない）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, seihon } from '../lib/kotoba.mjs';
import { askClaude, niseNoClaude } from '../lib/claude.mjs';
import { handle } from '../lib/api.mjs';
import { matome, matomeA, erabuCard, kouho, makeSteps, yobiNext, makeJunban, ZENBU, mieruKoumoku } from '../public/js/kurabe.js';

const j = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const demo = j('public/data/demo.json');
const cards = j('public/data/cards.json');
let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log(`○ ${name}`); });

await ok('デモ1は「聞く」の候補、デモ2は差なし、デモ3は「図」の候補', () => {
  assert.equal(matomeA(demo.結果.デモ1).kekka, 'kiku');
  assert.equal(erabuCard(demo.結果.デモ1), 'kiku');
  for (const k of ['A', 'B', 'C']) assert.equal(matome(demo.結果.デモ2, k).kekka, 'nashi');
  assert.equal(erabuCard(demo.結果.デモ2), 'dore');
  assert.equal(matome(demo.結果.デモ3, 'B').kekka, 'zu');
  assert.equal(erabuCard(demo.結果.デモ3), 'zu');
  assert.equal(matomeA(demo.結果.デモ1).kakunin, 2);
});

const JB = { B: { saisho: 'bun', irekae: false }, C: { saisho: 'ikki', irekae: false } };
const rec = (s, saisho = 'yomu') => ({ junban: { A: { saisho, irekae: false }, ...JB }, kekka: { 'A-1': { seikai: s[0] }, 'A-2': { seikai: s[1] }, 'A-3': { seikai: s[2] }, 'A-4': { seikai: s[3] } } });
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

await ok('図・区切りも2組（ABBA）で、同じ決まりで候補になる', () => {
  const j = { A: { saisho: 'yomu', irekae: false }, B: { saisho: 'bun', irekae: false }, C: { saisho: 'kugiri', irekae: true } };
  const steps = makeSteps(j);
  assert.deepEqual(steps.filter((x) => x.kind === 'B').map((x) => x.mode), ['bun', 'zu', 'zu', 'bun']);
  assert.deepEqual(steps.filter((x) => x.kind === 'C').map((x) => x.mondai), ['C2', 'C1', 'C4', 'C3']);
  // 図：文だけ B-1,B-4／図 B-2,B-3
  const r = { junban: j, kekka: { 'B-1': { seikai: 0 }, 'B-2': { seikai: 2 }, 'B-3': { seikai: 2 }, 'B-4': { seikai: 0 } } };
  assert.equal(matome(r, 'B').kekka, 'zu');
  r.kekka['B-4'].seikai = 1; // 揺れ1・差 +2,+1 → 候補にしない
  assert.equal(matome(r, 'B').kekka, 'nashi');
  assert.equal(ZENBU, 18);
});

await ok('どの結果でもカードは1枚で、強みのカード（この便で使うもの）', () => {
  for (let x = 0; x < 625; x++) {
    const s = [x % 5, Math.floor(x / 5) % 5, Math.floor(x / 25) % 5, Math.floor(x / 125) % 5];
    for (const saisho of ['yomu', 'kiku']) {
      const id = erabuCard(rec(s, saisho));
      assert.ok(cards.カード[id], id);
      assert.ok(!cards.カード[id]['この便では出さない'], id);
    }
  }
  assert.equal(erabuCard({ junban: rec([0, 0, 0, 0]).junban, kekka: {} }), 'tameshita');
  for (const id of ['kiku', 'zu', 'kugiru', 'kuchi', 'jikan']) assert.ok(cards.カード[id], `06 の5種類：${id}`);
  for (const c of Object.values(cards.カード)) assert.match(c.これは何か, /^この日のゲームでは/);
  assert.ok(cards.カード.kiku.自分でできる使い方.includes('長い文は、声に出して読んでみる。'));
  assert.ok(cards.カード.kiku.先生にお願いしてよいこと.includes('「説明は口でも言ってください」'));
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
function nisemono(kotaeList, { beta400 = false, futsuu400 = false } = {}) {
  const okutta = [];
  const kaesu = (req, kind) => {
    okutta.push({ ...req, kind });
    const t = kotaeList[Math.min(okutta.filter((x) => x.kind !== 'err').length - 1, kotaeList.length - 1)];
    return { stop_reason: 'end_turn', model: 'nise', content: [{ type: 'text', text: JSON.stringify(t) }] };
  };
  const err400 = (req, kind) => {
    okutta.push({ ...req, kind });
    const e = new Error('400 invalid_request_error');
    e.status = 400;
    throw e;
  };
  return {
    okutta,
    beta: { messages: { create: async (req) => (beta400 ? err400(req, 'beta') : kaesu(req, 'beta')) } },
    messages: { create: async (req) => (futsuu400 ? err400(req, 'futsuu') : kaesu(req, 'futsuu')) },
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
  assert.deepEqual(c.okutta[0].betas, ['server-side-fallback-2026-07-01']);
  assert.ok(c.okutta[0].system.includes(sakeru), '決まりが Claude に渡っている');
});

await ok('書き直しても残るときは使わない（予備の動きへ）', async () => {
  const c = nisemono([{ a: `${sakeru}` }]);
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, false);
  assert.equal(c.okutta.length, 3);
});

await ok('試験的な呼び方で 400 なら、ふつうの呼び方で1回だけ呼び直す', async () => {
  const c = nisemono([{ a: '聞いて答えるとき、力が出ているかも。' }], { beta400: true });
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, true);
  assert.equal(r.yobikata, 'futsuu');
  assert.deepEqual(c.okutta.map((x) => x.kind), ['beta', 'futsuu']);
  assert.equal(c.okutta[1].betas, undefined);
  assert.equal(c.okutta[1].fallbacks, undefined);
  assert.equal(c.okutta[1].output_config, undefined);
});

await ok('ふつうの呼び方でもだめなら、予備の動き（サーバーの関数まで通して）', async () => {
  const c = nisemono([{ kasetsu: 'x', tsugi: 'y', konkyo: [] }], { beta400: true, futsuu400: true });
  niseNoClaude(c);
  const [st, r] = await handle('kasetsu', 'POST', { record: demo.結果.デモ1, atehamaru: [] }, { ANTHROPIC_API_KEY: 'nise' }, 'test');
  niseNoClaude(null);
  assert.equal(st, 200);
  assert.equal(r.dare, 'yobi');
  assert.deepEqual(c.okutta.map((x) => x.kind), ['beta', 'futsuu']);
  assert.match(r.kasetsu, /かも/);
  assert.equal(r.sankou, '参考程度・決めるのは先生');
});

await ok('試験的な呼び方で形が合わないときも、ふつうの呼び方で呼び直す', async () => {
  const c = nisemono([{ b: 1 }, { a: 'よい形' }]);
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, true);
  assert.deepEqual(c.okutta.map((x) => x.kind), ['beta', 'futsuu']);
});

await ok('サーバーの関数：偽の Claude がよい文を返せば Claude の文を出す', async () => {
  const c = nisemono([{ kasetsu: '問題文を聞いて答えるとき、力が出ているかも。', tsugi: '次に試すなら、問題文を読み上げる。', konkyo: ['聞く 4問・4問'] }]);
  niseNoClaude(c);
  const [, r] = await handle('kasetsu', 'POST', { record: demo.結果.デモ1, atehamaru: [] }, { ANTHROPIC_API_KEY: 'nise' }, 'test2');
  niseNoClaude(null);
  assert.equal(r.dare, 'claude');
  assert.deepEqual(r.kakunin, { A: 2, B: 2, C: 2 });
});

await ok('前もって作った音声が、読み上げる文をすべて持っている', () => {
  const tana = j('public/data/tana.json');
  const g = j('public/data/gakushu.json');
  const onsei = j('public/onsei/onsei.json').音声;
  const bun = [];
  for (const p of Object.values(tana.A.文章)) { bun.push(p.本文.join('')); p.問い.forEach((q) => bun.push(q.文)); }
  for (const q of Object.values(tana.D.質問)) bun.push(`${q.問い}。${q.選択肢.join('。')}。`);
  bun.push(g.問題.本文.join(''));
  const nai = bun.filter((t) => !onsei[t]);
  assert.deepEqual(nai, [], '音声の無い文があります。scripts/onsei_tsukuru.py で作り直してください');
});

await ok('チェック項目：候補は、先生が選んだものだけ画面に出る', () => {
  const c = { 項目: [{ id: 'a', 文: 'あ' }], 先生が選ぶ候補: [{ id: 'b', 文: 'い' }, { id: 'c', 文: 'う', 先生が選んだ: true }] };
  assert.deepEqual(mieruKoumoku(c).map((x) => x.id), ['a', 'c']);
  const real = j('public/data/checklist.json');
  assert.equal(real.項目.length, 18);
  assert.equal(real.項目[0].文, '解けているのに、ノートが白紙のことがある'); // 06 の5章の1
  assert.equal(real.項目[17].文, '注意した直後は止まる（あとで個別に言うと直る）'); // 06 の5章の18
  assert.ok(real.先生が選ぶ候補.length > 0);
  assert.equal(mieruKoumoku(real).length, 18, '候補は画面に出ていない');
});

console.log(`\n${n} 件の確かめが通りました。`);
