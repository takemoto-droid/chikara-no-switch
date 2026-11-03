// 比べ方・カード・Claude の書き直しの流れを確かめる（キーは使わない）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, seihon } from '../lib/kotoba.mjs';
import { askClaude, niseNoClaude } from '../lib/claude.mjs';
import { handle } from '../lib/api.mjs';
import { matome, matomeA, erabuCard, kouho, makeSteps, yobiNext, makeJunban, ZENBU, mieruKoumoku, matomeKai, erabuCardKai, cardNoBun, motteiruCards, watasuCards } from '../public/js/kurabe.js';

const j = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const demo = j('public/data/demo.json');
const cards = j('public/data/cards.json');
let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log(`○ ${name}`); });

await ok('デモ1は「聞く」の候補、デモ2は差なし、デモ3は「図」の候補', () => {
  assert.equal(matomeA(demo.結果.デモ1.kai[0]).kekka, 'kiku');
  assert.equal(erabuCard(demo.結果.デモ1.kai[0]), 'kiku');
  for (const k of ['A', 'B', 'C']) assert.equal(matome(demo.結果.デモ2.kai[0], k).kekka, 'nashi');
  assert.equal(erabuCard(demo.結果.デモ2.kai[0]), 'dore');
  assert.equal(matome(demo.結果.デモ3.kai[0], 'B').kekka, 'zu');
  assert.equal(erabuCard(demo.結果.デモ3.kai[0]), 'zu');
  assert.equal(matomeA(demo.結果.デモ1.kai[0]).kakunin, 2);
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
  const [st, r] = await handle('kasetsu', 'POST', { record: demo.結果.デモ1.kai[0], atehamaru: [] }, { ANTHROPIC_API_KEY: 'nise' }, 'test');
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
  const [, r] = await handle('kasetsu', 'POST', { record: demo.結果.デモ1.kai[0], atehamaru: [] }, { ANTHROPIC_API_KEY: 'nise' }, 'test2');
  niseNoClaude(null);
  assert.equal(r.dare, 'claude');
  assert.deepEqual(r.kakunin, { 回: 1, A: 2, B: 2, C: 2 });
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

// ---- 3便：回をまたいで比べる
const kai = (id) => demo.結果[id].kai;
await ok('デモの子4〜6：くり返し出た候補は、①（デモ4）だけ', () => {
  assert.equal(kai('デモ4').length, 3);
  assert.equal(matomeKai(kai('デモ4'), 'A').kurikaeshi, 'kiku');
  for (const id of ['デモ5', 'デモ6']) {
    assert.equal(kai(id).length, 3);
    for (const k of ['A', 'B', 'C']) assert.equal(matomeKai(kai(id), k).kurikaeshi, null, `${id} ${k}`);
  }
  // ③：1回目だけ「その回の候補」
  assert.deepEqual(matomeKai(kai('デモ6'), 'A').rows.map((r) => r.ookii), [true, false, false]);
  assert.deepEqual(erabuCardKai(kai('デモ4')), { card: 'kiku', kurikaeshi: { kind: 'A', mode: 'kiku', onaji: [1, 2, 3], onajiHi: ['2026-09-09', '2026-10-14', '2026-11-11'], zenkai: 3 } });
  assert.equal(erabuCardKai(kai('デモ5')).card, 'dore');
  // 1回だけの子は、くり返しにならない
  for (const id of ['デモ1', 'デモ2', 'デモ3']) assert.equal(erabuCardKai(kai(id)).kurikaeshi, null);
});

const A1 = { A: { saisho: 'yomu', irekae: false }, B: { saisho: 'bun', irekae: false }, C: { saisho: 'ikki', irekae: false } };
// 読む：A-1, A-4／聞く：A-2, A-3
const kaiA = (yomu, kiku, n) => ({ kai: n, owari: true, junban: A1, kekka: { 'A-1': { seikai: yomu[0] }, 'A-2': { seikai: kiku[0] }, 'A-3': { seikai: kiku[1] }, 'A-4': { seikai: yomu[1] } } });
await ok('くり返し出た候補は、その回の中の差どうしで決まり、素点を回ごとに比べない', () => {
  // 2回目は全体に正解が少なくても、その回の中で聞くが多ければ、くり返しになる
  assert.equal(matomeKai([kaiA([1, 1], [3, 3], 1), kaiA([0, 0], [1, 1], 2)], 'A').kurikaeshi, 'kiku');
  // 2回目に素点が大きく増えても、その回の中に差が無ければ、くり返しにならない
  assert.equal(matomeKai([kaiA([1, 1], [3, 3], 1), kaiA([4, 4], [4, 4], 2)], 'A').kurikaeshi, null);
  // 回ごとに素点をずらしても（その回の全部の出し方に同じ数を足しても）、結果は変わらない
  const base = [kaiA([1, 2], [3, 3], 1), kaiA([0, 1], [2, 2], 2), kaiA([2, 2], [2, 3], 3)];
  const zurasu = base.map((r, i) => ({ ...r, kekka: Object.fromEntries(Object.entries(r.kekka).map(([k, v]) => [k, { seikai: v.seikai + i }])) }));
  assert.deepEqual(matomeKai(base, 'A').rows.map((r) => [r.sa, r.muki, r.ookii]), matomeKai(zurasu, 'A').rows.map((r) => [r.sa, r.muki, r.ookii]));
  assert.equal(matomeKai(base, 'A').kurikaeshi, matomeKai(zurasu, 'A').kurikaeshi);
  // 反対向きの「その回の候補」があれば、くり返しにしない
  assert.equal(matomeKai([kaiA([1, 1], [3, 3], 1), kaiA([1, 2], [2, 3], 2), kaiA([3, 3], [1, 1], 3)], 'A').kurikaeshi, null);
  // 「その回の候補」が1回も無ければ、同じ向きが続いても、くり返しにしない
  assert.equal(matomeKai([kaiA([1, 2], [2, 3], 1), kaiA([1, 2], [2, 3], 2)], 'A').kurikaeshi, null);
});

await ok('くり返しのカード：回の数を事実で書き、「伸びた」「上がった」が無い', () => {
  const e = erabuCardKai(kai('デモ4'));
  const c = cardNoBun(cards.カード[e.card], e.kurikaeshi);
  assert.match(c.これは何か, /^これまでに別々の日にした3日分のゲームのうち、3日分で、くり返し/);
  for (const card of Object.values(cards.カード)) {
    const t = JSON.stringify(card);
    assert.ok(!/伸び|上がった/.test(t), card.名前);
  }
});

await ok('はなす・じっくりのカードは、どの結果でも出ない。棚 E が無い', () => {
  assert.ok(cards.カード.kuchi.出さない && cards.カード.jikan.出さない, 'データには残す');
  const tana = j('public/data/tana.json');
  assert.equal(tana.E, undefined);
  const deru = new Set();
  for (let x = 0; x < 625; x++) {
    const s = [x % 5, Math.floor(x / 5) % 5, Math.floor(x / 25) % 5, Math.floor(x / 125) % 5];
    const r1 = { ...rec(s), kai: 1, owari: true };
    const r2 = { ...rec([s[1], s[0], s[3], s[2]], 'kiku'), kai: 2, owari: true };
    deru.add(erabuCardKai([r1]).card);
    deru.add(erabuCardKai([r1, r2]).card);
  }
  assert.ok(!deru.has('kuchi') && !deru.has('jikan'), [...deru].join(','));
});

await ok('サーバーの関数：回の並びを読み、くり返しを予備の文にも書く', async () => {
  const [, r] = await handle('kasetsu', 'POST', { record: kai('デモ4')[2], kai: kai('デモ4'), atehamaru: [] }, {}, 'test3');
  assert.equal(r.dare, 'yobi');
  assert.match(r.kasetsu, /3日分のゲームのうち、3日分/);
  assert.equal(r.kakunin.回, 3);
  assert.equal(r.kurikaeshi.mode, 'kiku');
  const [, t] = await handle('tsutae', 'POST', { record: kai('デモ6')[2], kai: kai('デモ6') }, {}, 'test3');
  assert.match(t.kondan, /3回のゲームでは/);
  assert.ok(!/伸び|上がった/.test(JSON.stringify([r, t])));
});

// ---- 4便
await ok('0：くり返しの決まりは3便のゆるい形のまま（その回の候補1回＋別の日に同じ向き）', () => {
  // 1回目：その回の候補（差 +2,+2・揺れ0）、2回目：同じ向きだが揺れより大きくない（差 +1,+1・揺れ1）→ くり返し
  const r1 = { ...kaiA([1, 1], [3, 3], 1), hi: '2026-09-01' };
  const r2 = { ...kaiA([1, 2], [2, 3], 2), hi: '2026-10-01' };
  assert.equal(matomeKai([r1, r2], 'A').kurikaeshi, 'kiku');
});

await ok('0：くり返しが無いときは、いちばん新しい回からカードを渡す', () => {
  const r1 = { ...kaiA([1, 1], [3, 3], 1), hi: '2026-09-01' }; // 1回目は聞くの候補
  const r2 = { ...kaiA([2, 2], [2, 2], 2), hi: '2026-10-01' }; // 2回目は差なし
  assert.deepEqual(watasuCards([r1, r2]).map((x) => x.card), ['dore']);
  assert.deepEqual(watasuCards([r2, r1]).map((x) => x.card), ['kiku']);
});

await ok('1：くり返し出た棚ごとにカードがたまり、一度もらったカードは消えない。新しいカードが前に出る', () => {
  const both = (y, k, n, hi) => {
    const r = { ...kaiA(y, k, n), hi };
    // 図の棚も：文で見る B-1,B-4／図で見る B-2,B-3
    Object.assign(r.kekka, { 'B-1': { seikai: 0 }, 'B-2': { seikai: 2 }, 'B-3': { seikai: 2 }, 'B-4': { seikai: 0 } });
    return r;
  };
  const r1 = both([1, 1], [3, 3], 1, '2026-09-01');
  const r2 = both([1, 1], [3, 3], 2, '2026-10-01');
  const m1 = motteiruCards([r1]);
  assert.equal(m1.cards.length, 1); // 1回目は、その回のカード1枚（差の大きい棚）
  const m2 = motteiruCards([r1, r2]);
  assert.deepEqual(m2.cards.map((c) => c.card).sort(), ['kiku', 'zu']);
  assert.ok(m2.cards.every((c) => c.kurikaeshi), 'どちらも、くり返しのカード');
  assert.equal(m2.atarashii.length, 1, '2回目で増えたのは1枚');
  assert.equal(m2.cards[0].card, m2.atarashii[0], '増えたカードが前');
  // 3回目が差なしでも、もらったカードは消えない
  const r3 = { ...kaiA([2, 2], [2, 2], 3), hi: '2026-11-01' };
  const m3 = motteiruCards([r1, r2, r3]);
  assert.ok(m3.cards.map((c) => c.card).includes('kiku'));
  // 全員に1枚以上
  assert.ok(motteiruCards([]).cards.length >= 1);
  assert.ok(motteiruCards([{ ...kaiA([2, 2], [2, 2], 1), hi: '2026-09-01' }]).cards.length >= 1);
});

await ok('2：同じ日の2回目は、くり返しに数えない', () => {
  const r1 = { ...kaiA([1, 1], [3, 3], 1), hi: '2026-09-01' };
  const r2 = { ...kaiA([1, 1], [3, 3], 2), hi: '2026-09-01' }; // 同じ日
  assert.equal(matomeKai([r1, r2], 'A').kurikaeshi, null);
  const r3 = { ...kaiA([1, 2], [2, 3], 3), hi: '2026-10-01' }; // 別の日に同じ向き
  const x = matomeKai([r1, r2, r3], 'A');
  assert.equal(x.kurikaeshi, 'kiku');
  assert.deepEqual(x.onajiHi, ['2026-09-01', '2026-10-01']);
  assert.equal(x.zenHi.length, 2);
  const e = erabuCardKai([r1, r2, r3]);
  assert.match(cardNoBun(cards.カード.kiku, e.kurikaeshi).これは何か, /2日分のゲームのうち、2日分/);
});

await ok('4：子どもの安全とプライバシーのページがあり、画面から開ける写しが同じ', () => {
  const moto = readFileSync(path.join(ROOT, 'docs/子どもの安全とプライバシー.md'), 'utf8');
  assert.equal(readFileSync(path.join(ROOT, 'public/anzen.md'), 'utf8'), moto, 'npm run utsusu で写し直してください');
  assert.match(moto, /https:\/\/support\.claude\.com\/en\/articles\/9307344/);
  assert.match(moto, /https:\/\/www\.anthropic\.com\/legal\/commercial-terms/);
  assert.match(moto, /2026-11-03 に開いて確かめた/);
  assert.match(readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), /#\/anzen/);
});

await ok('7：概要の下書きは、1文目が「誰の・何の困りごとか」で始まる', () => {
  const t = readFileSync(path.join(ROOT, 'docs/概要_下書き.md'), 'utf8');
  assert.match(t, /下書き（先生未確認）/);
  const ichibun = t.split('\n').find((l) => l && !l.startsWith('#') && !l.startsWith('>'));
  assert.match(ichibun, /^困りごとを自分では言葉にできない中学生は、/);
});

console.log(`\n${n} 件の確かめが通りました。`);
