// 比べ方・カード・Claude の書き直しの流れを確かめる（キーは使わない）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fsAll from 'node:fs';
const require_fs = () => fsAll;
import path from 'node:path';
import { ROOT, seihon } from '../lib/kotoba.mjs';
import { askClaude, niseNoClaude } from '../lib/claude.mjs';
import { danWoDasu, ookattaKa, sodateKouho, erabuMondai, sodateCards, sodateCardNoBun, ichininmaeOf, hitotsuNoKazu, jibunDeErabu, SODATE_MODES, DAN_NO_DASHIKATA } from '../public/js/sodateru.js';
import { handle } from '../lib/api.mjs';
import { dankaiWoSusumeru, stepsOf, matome, matomeA, erabuCard, kouho, makeSteps, yobiNext, makeJunban, zenbuOf, mieruKoumoku, matomeKai, erabuCardKai, cardNoBun, motteiruCards, watasuCards, namaeWoAwaseru, cardNoFukudai, levelNoNamae, LEVEL_JOUGEN } from '../public/js/kurabe.js';

const j = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const demo = j('public/data/demo.json');
const cards = namaeWoAwaseru(j('public/data/cards.json'), j('public/data/card_namae.json'));
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
  assert.equal(zenbuOf({ junban: j }), 22); // 練習2・読む聞く4・図4・区切り4・質問8（7便で質問を8に）
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
  for (const c of Object.values(cards.カード).filter((x) => !/育てるカード/.test(x['06の種類']))) assert.match(c.これは何か, /^この日のゲームでは/);
  assert.ok(cards.カード.kiku.自分でできる使い方.includes('長い文は、声に出して読んでみる。'));
  assert.ok(cards.カード.kiku.先生にお願いしてよいこと.includes('「説明は口でも言ってください」'));
});

await ok('練習が終わるまでは練習だけ。予備の順で最後まで行ける', () => {
  const r = { junban: makeJunban('テスト'), kekka: {} };
  assert.deepEqual(kouho(r), ['A-r1']);
  const jun = [];
  for (let i = 0; i < 40; i++) {
    const id = yobiNext(r);
    if (!id) break;
    jun.push(id);
    r.kekka[id] = { seikai: 2, kazu: 4 }; // 半分ずつ正解（段階は2のまま・切りかえなし）
    dankaiWoSusumeru(r);
  }
  assert.equal(jun.length, zenbuOf(r));
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
  const onsei = j('public/onsei/onsei.json').音声;
  const bun = [];
  for (const p of Object.values(tana.A.文章)) { bun.push(p.本文.join('')); p.問い.forEach((q) => bun.push(q.文)); }
  for (const q of Object.values(tana.D.質問)) bun.push(`${q.問い}。${q.選択肢.join('。')}。`);
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
  assert.deepEqual(erabuCardKai(kai('デモ4')), { card: 'kiku', kurikaeshi: { kind: 'A', mode: 'kiku', onaji: [1, 2, 3], onajiHi: ['2026-09-09', '2026-10-07', '2026-10-28'], zenkai: 3 } });
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
  assert.match(c.これは何か, /^これまでに別々の日にした3日分のゲームのすべてで、くり返し/);
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
  assert.match(r.kasetsu, /3日分のゲームのすべてで/);
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
  assert.match(cardNoBun(cards.カード.kiku, e.kurikaeshi).これは何か, /2日分のゲームのすべてで/);
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

await ok('8：動画素材の画面写しがそろっている（npm run douga で作る）', () => {
  const { readdirSync } = require_fs();
  const f = readdirSync(path.join(ROOT, 'docs/動画素材'));
  for (const w of ['次を選んだ理由', 'スイッチカードを受け取る', 'まとめと仮説', '回ごとの表', 'デモ5_差が出なかった子のカード']) {
    assert.ok(f.some((x) => x.includes(w) && x.endsWith('.png')), w);
  }
});

// ---- 5便
await ok('F1-a：棚 C は「連絡を読んで中身を答える」形。どの問いも、その番目の文に答えがある', () => {
  const tana = j('public/data/tana.json');
  const C = tana.C.文章;
  assert.deepEqual(Object.keys(C), ['C1', 'C2', 'C3', 'C4', 'C1Y', 'C2Y', 'C3Y', 'C4Y']);
  for (const [id, p] of Object.entries(C)) {
    const n = p.段階 === 1 ? 3 : 4; // 段階1は連絡3文・問い3つ（7便）
    assert.ok(p.前おき && p.連絡.length === n && p.問い.length === n, id);
    p.問い.forEach((q, i) => {
      assert.equal(q.選択肢.length, 4, `${id} 問い${i + 1}`);
      assert.ok(q.答え >= 0 && q.答え < 4);
      assert.ok(p.連絡[i].includes(q.本文の根拠), `${id} 問い${i + 1} の答えが ${i + 1} 文目にない`);
      assert.ok(q.選択肢[q.答え].startsWith(q.本文の根拠) || q.本文の根拠.startsWith(q.選択肢[q.答え].slice(0, 4)), `${id} 問い${i + 1}`);
    });
    // 並びを頭の中で動かす形をやめた
    assert.ok(!/並べ|入れかえ|左から/.test(JSON.stringify(p)), `${id} に並べかえの言葉がある`);
  }
  // 長さと漢字の割合がそろっている（目安：90〜115字・漢字 28〜40%）
  for (const p of Object.values(C).filter((x) => x.段階 !== 1)) {
    const t = p.連絡.join('');
    const kanji = [...t].filter((c) => /\p{Script=Han}/u.test(c)).length / t.length;
    assert.ok(t.length >= 90 && t.length <= 115 && kanji >= 0.28 && kanji <= 0.4, t.slice(0, 10));
  }
});

await ok('F1-e：デモの子の回の日付は、すべて 2026-11-08 より前', () => {
  for (const [id, k] of Object.entries(demo.結果)) for (const r of k.kai) assert.ok(r.hi < '2026-11-08', `${id} ${r.hi}`);
});

await ok('F2：⑤ 伝え方に「学年・教科の先生への一言」がある。サーバーのエラーは日本語', async () => {
  for (const id of ['デモ1', 'デモ4', 'デモ5']) {
    const [, t] = await handle('tsutae', 'POST', { record: kai(id)[kai(id).length - 1], kai: kai(id) }, {}, 'f2');
    assert.ok(t.hitokoto && t.hitokoto.length > 20, id);
  }
  const [st, e] = await handle('kasetsu', 'POST', { record: { junban: 5 } }, {}, 'f2');
  assert.equal(st, 400);
  assert.match(e.error, /[\u3040-\u30ff\u4e00-\u9fff]/);
});

await ok('F4（Should）：引き継ぎの記録の書き出しは、回ごとの日付・年度・差の向きを並べ、言葉の点検を通る', async () => {
  const { hikitsugiNoBun } = await import('../public/js/hikitsugi.js');
  const { tenkenAll } = await import('../lib/kotoba.mjs');
  const tana = j('public/data/tana.json');
  for (const id of ['デモ1', 'デモ4', 'デモ6']) {
    const k = kai(id).map((r, i) => ({ ...r, id, kai: i + 1 }));
    const bun = hikitsugiNoBun({ id, kai: k, cards, tana, atehamaru: ['個別に聞くと答える'], kakuHi: '2026-11-03' });
    assert.equal(tenkenAll(bun).length, 0, id);
    assert.match(bun, /参考程度/);
    for (const r of k) assert.ok(bun.includes(r.hi), `${id} ${r.hi}`);
    assert.match(bun, /2026年度/);
  }
  const bun4 = hikitsugiNoBun({ id: 'デモ4', kai: kai('デモ4').map((r, i) => ({ ...r, kai: i + 1 })), cards, tana, atehamaru: [], kakuHi: '2026-11-03' });
  assert.match(bun4, /「聞く」（別々の日 3日のうち 3日）/);
});

await ok('F4（Should）：練習問題を Claude が作る道筋。キーが無いと決まった練習問題、形が合えば使い、合わなければ使わない', async () => {
  const [, r0] = await handle('renshu', 'POST', { mode: 'yomu', n: 1 }, {}, 'f4');
  assert.equal(r0.dare, 'yobi');
  assert.equal(r0.mondai, null);
  const yoi = { honbun: ['図書室では、毎週水曜日に新しい本が入ります。', '入った本は、入口のたなに一週間ならびます。', '借りたい人は、カウンターで名前を書きます。', '返すときは、図書室の前の返却ポストに入れれば大丈夫です。'],
    toi: [{ bun: '新しい本は、毎週水曜日に入る。', kotae: true, shurui: '本文どおり' }, { bun: '新しい本は、一週間入口に置かれる。', kotae: true, shurui: '言い換え' }, { bun: '新しい本は、毎週金曜日に入る。', kotae: false, shurui: '一語変え' }, { bun: '図書室では、本の読み聞かせ会がある。', kotae: false, shurui: '無関係' }] };
  niseNoClaude(nisemono([yoi]));
  const [, r1] = await handle('renshu', 'POST', { mode: 'kiku', n: 1 }, { ANTHROPIC_API_KEY: 'nise' }, 'f4a');
  assert.equal(r1.dare, 'claude');
  assert.equal(r1.mondai.本文.length, 4);
  assert.equal(r1.mondai.問い.filter((q) => q.答え).length, 2);
  const warui = { ...yoi, toi: yoi.toi.map((t) => ({ ...t, shurui: '本文どおり' })) };
  niseNoClaude(nisemono([warui]));
  const [, r2] = await handle('renshu', 'POST', { mode: 'kiku', n: 1 }, { ANTHROPIC_API_KEY: 'nise' }, 'f4b');
  niseNoClaude(null);
  assert.equal(r2.dare, 'yobi');
  assert.equal(r2.mondai, null);
});

await ok('F4（Should）：作ったものは should.json で外せる', () => {
  const sh = j('public/data/should.json');
  for (const k of ['hikitsugi', 'renshu', 'otona']) assert.equal(typeof sh[k].使う, 'boolean', k);
  assert.ok(j('public/data/annai.json').大人.Should);
});

// ---- 6便
await ok('G1-h：⑤ 伝え方の予備の文に「○日分のうち○日分」の重なりが無く、保護者向け説明はカードの説明3つの形', async () => {
  const { nichiBun } = await import('../public/js/kurabe.js');
  assert.equal(nichiBun(3, 3), '3日分のゲームのすべてで');
  assert.equal(nichiBun(3, 2), '3日分のゲームのうち、2日分で');
  for (const id of ['デモ1', 'デモ4', 'デモ5', 'デモ6']) {
    const [, t] = await handle('tsutae', 'POST', { record: kai(id)[kai(id).length - 1], kai: kai(id) }, {}, 'g1');
    const zen = JSON.stringify(t);
    assert.ok(!/(\d+)日分のうち\1日分/.test(zen) && !/(\d+)日分のゲームのうち、\1日分/.test(zen), id);
    for (const w of ['これは何か：', '自分でできる使い方：', '先生にお願いしてよいこと：']) assert.ok(t.hogosha.includes(w), `${id} ${w}`);
    assert.ok(!t.kondan.includes(t.hogosha.split('\n')[1].replace('これは何か：', '')), `${id} 懇談の下書きが保護者向け説明の写しになっている`);
  }
});

await ok('G1-g・i・j：安全のページの出典、C3 の根拠、時間を言い切らない案内', () => {
  const a = readFileSync(path.join(ROOT, 'docs/子どもの安全とプライバシー.md'), 'utf8');
  assert.match(a, /第369回個人情報保護委員会・令和８年９月16日/);
  assert.match(a, /PDF の中身までは、まだ確かめていない/);
  assert.equal(readFileSync(path.join(ROOT, 'public/anzen.md'), 'utf8'), a);
  const c3 = j('public/data/tana.json').C.文章.C3.問い[3];
  assert.equal(c3.本文の根拠, '使ったコーンを倉庫にもどして');
  const an = j('public/data/annai.json');
  assert.ok(!/10分/.test(JSON.stringify(an.子ども)) && !/10分/.test(JSON.stringify(an.保護者)), '案内で時間を言い切らない');
  assert.match(readFileSync(path.join(ROOT, 'docs/先生が確かめる一覧.md'), 'utf8'), /15〜20分ほど/);
});

await ok('G2：線を比べた表と選んだ線が残り、X2 の骨と5便の線は変わっていない', () => {
  const t = readFileSync(path.join(ROOT, 'docs/線の比べ_6便.md'), 'utf8');
  assert.match(t, /各3,000人/);
  for (const w of ['5便の線', '線1 揺れを平均に', '線3 別の日は合計の向き', '線6', '選んだ線と、そのわけ']) assert.ok(t.includes(w), w);
  const g = readFileSync(path.join(ROOT, 'docs/合成データでの確かめ.md'), 'utf8');
  assert.match(g, /## 5\. 線の比べ（6便/);
  assert.match(g, /93\.9%/); // 5便の表が残っている
  const r = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(r, /線の扱い（6便）/);
  assert.match(r, /選んだ線：5便の線のまま/);
  // 骨と5便の線：揺れは大きいほう（読む 2・2／聞く 4・3 → 揺れ1。差 +2,+1 は候補にしない）
  assert.equal(matomeA(rec([2, 4, 3, 2])).yure, 1);
  assert.equal(matomeA(rec([2, 4, 3, 2])).kekka, 'nashi');
});

// ---- 7便：難しさの段階
function hrWoSuru(junban, kotae) {
  // kotae(step) → 正解の数。ゲームと同じく、1つ答えるごとに段階を進める
  const r = { junban, kekka: {} };
  for (let i = 0; i < 60; i++) {
    const id = yobiNext(r);
    if (!id) break;
    const st = stepsOf(r).find((x) => x.id === id);
    const kazu = st.kind === 'D' ? undefined : st.kind === 'B' ? (st.dankai === 1 ? 1 : 2) : st.renshu ? 4 : (st.dankai === 1 ? 3 : 4);
    r.kekka[id] = st.kind === 'D' ? { kotae: '今は答えない' } : { seikai: kotae(st, kazu), kazu };
    dankaiWoSusumeru(r);
  }
  return r;
}
await ok('H2：練習の正解率で段階を選ぶ（3/8 以下なら段階1から）', () => {
  const j = makeJunban('段階');
  const hikui = hrWoSuru(j, (st, kazu) => (st.renshu ? 1 : Math.ceil(kazu / 2)));
  assert.equal(hikui.dankai.A.dankai, 1);
  assert.ok(stepsOf(hikui).filter((x) => x.kind === 'A' && !x.renshu).every((x) => x.dankai === 1 && /Y$/.test(x.mondai)));
  const futsuu = hrWoSuru(j, (st, kazu) => Math.ceil(kazu / 2));
  assert.equal(futsuu.dankai.A.dankai, 2);
});

await ok('H2：1組目がほぼ0なら、次の組から段階を変え、変える前の組は練習扱い。比べるのは同じ段階の中だけ', () => {
  const j = makeJunban('切りかえ');
  // 練習はふつう（段階2）。読む／聞くの1組目は0問、あとは半分
  const r = hrWoSuru(j, (st, kazu) => (st.id === 'A-1' || st.id === 'A-2' ? 0 : st.renshu ? 4 : Math.ceil(kazu / 2)));
  assert.deepEqual(r.dankai.A.kirikae.to, 1);
  const a = stepsOf(r).filter((x) => x.kind === 'A' && !x.renshu);
  assert.deepEqual(a.map((x) => x.id), ['A-1', 'A-2', 'A-5', 'A-6', 'A-7', 'A-8']);
  assert.ok(a.slice(0, 2).every((x) => x.renshuAtsukai && x.dankai === 2));
  assert.ok(a.slice(2).every((x) => x.dankai === 1));
  const m = matome(r, 'A');
  assert.equal(m.dankai, 1);
  assert.equal(m.kirikae, 1);
  assert.equal(m.kakunin, 2);
  assert.equal(m.kazu, 3);
  // 1組目の 0問は、比べる数に入っていない
  assert.ok(![...m.yomu, ...m.kiku].includes(0));
  // 2組目以降は見ない（切りかえは1回だけ）
  assert.equal(r.dankai.B.kirikae, undefined);
});

await ok('H2：子どもの画面のもと（ゲーム・カード・案内）に、段階の言葉が無い', () => {
  const game = readFileSync(path.join(ROOT, 'public/js/game.js'), 'utf8');
  const card = j('public/data/cards.json');
  const annai = j('public/data/annai.json');
  for (const [mei, t] of [['game.js', game], ['cards', JSON.stringify(card.カード)], ['annai', JSON.stringify(annai.子ども)]]) {
    assert.ok(!/段階|やさしめ|むずかしめ|ふつうの文|3文の連絡|4文の連絡|物が1つの場面|物が2つの場面/.test(t.replace(/\/\/.*$/gm, '')), mei);
  }
});

await ok('H3：カードのレベルは下がらない。上限は3。副題とレベルの名前が付く', () => {
  const r = (y, k, n, hi) => ({ ...kaiA(y, k, n), hi });
  const r1 = r([1, 1], [3, 3], 1, '2026-09-01');
  const r2 = r([1, 1], [3, 3], 2, '2026-10-01');
  const r3 = r([1, 1], [3, 3], 3, '2026-11-01');
  const r4 = r([3, 3], [1, 1], 4, '2026-11-02'); // 反対向きの候補
  const r5 = r([1, 1], [3, 3], 5, '2026-11-03');
  const kiku = (list) => motteiruCards(list).cards.find((c) => c.card === 'kiku');
  assert.equal(kiku([r1]).level, 1);
  assert.equal(kiku([r1, r2]).level, 2);
  assert.equal(kiku([r1, r2, r3]).level, 3);
  assert.equal(kiku([r1, r2, r3, r4]).level, 3, '反対向きの日があっても、下がらない');
  assert.equal(kiku([r1, r2, r3, r4, r5]).level, LEVEL_JOUGEN, '上限より上にならない');
  assert.deepEqual(motteiruCards([r1]).agatta, []);
  assert.deepEqual(motteiruCards([r1, r2]).agatta, ['kiku']);
  assert.deepEqual(motteiruCards([r1, r2, r3, r4]).agatta, [], '進まなかった日は出さない');
  assert.equal(levelNoNamae(cards, kiku([r1])), 'みつけた');
  assert.equal(levelNoNamae(cards, kiku([r1, r2])), 'たしかめた');
  assert.equal(levelNoNamae(cards, kiku([r1, r2, r3])), 'しっかり');
  assert.deepEqual(motteiruCards([r1, r2, r3]).agatta, ['kiku'], '同じカードのレベルが進んだことは分かる');
  assert.equal(cards.カード.kiku.名前, 'きいてスイッチ');
  assert.equal(cardNoFukudai(cards, kiku([r1])), '読むと聞くを比べて');
  assert.equal(cardNoFukudai(cards, { card: 'dore' }), '3つの比べで差なし');
  assert.equal(cardNoFukudai(cards, { card: 'zu', kind: 'B' }), '文と図を比べて');
  assert.equal(cardNoFukudai(cards, { card: 'kugiru' }), '一気にと区切ってを比べて');
  // ためしたカードにはレベルを付けない
  assert.equal(motteiruCards([]).cards[0].level, null);
  // どれでもカードは、差なしだった別々の日の数
  const n1 = r([2, 2], [2, 2], 1, '2026-09-01');
  const n2 = r([2, 2], [2, 2], 2, '2026-09-01');
  const n3 = r([2, 2], [2, 2], 3, '2026-10-01');
  assert.equal(motteiruCards([n1, n2]).cards[0].level, 1, '同じ日は1日');
  assert.equal(motteiruCards([n1, n2, n3]).cards[0].level, 2);
});

await ok('H3：カードの名前は card_namae.json の1つだけにある（cards.json と画面のコードには書かない）', () => {
  const namae = j('public/data/card_namae.json');
  const moto = j('public/data/cards.json');
  for (const [id, c] of Object.entries(moto.カード)) assert.equal(c.名前, '（card_namae.json）', id);
  for (const id of Object.keys(moto.カード)) assert.ok(namae.名前[id], `名前がある：${id}`);
  const mei = Object.values(namae.名前).filter((x) => !/はなす|じっくり/.test(x));
  for (const f of ['public/js/app.js', 'public/js/game.js', 'public/js/kurabe.js', 'public/js/hikitsugi.js', 'lib/yobi.mjs', 'lib/api.mjs']) {
    const t = readFileSync(path.join(ROOT, f), 'utf8');
    for (const x of mei) assert.ok(!t.includes(x), `${f} に「${x}」を書かない`);
  }
  for (const x of [...Object.values(namae.レベル.見つけた), ...Object.values(namae.副題.見つけた), namae.副題.どれでも]) {
    for (const f of ['public/js/app.js', 'public/js/kurabe.js']) assert.ok(!readFileSync(path.join(ROOT, f), 'utf8').includes(x), `${f} に「${x}」を書かない`);
  }
});

await ok('H3：カードの画面に、カードの合計・順位・枚数を出さない', () => {
  const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  const cardKansu = app.slice(app.indexOf('async function card('), app.indexOf('// ---- ④ 先生の画面'));
  assert.ok(!/motte\.length|cards\.length|枚目|合計|順位|ランキング|\d+枚/.test(cardKansu.replace(/\/\/.*$/gm, '')));
});

// ---- H4：⑥ 育てる（朝の練習）
const hh = (mode, dan, seikai, kazu = 4, extra = {}) => ({ mode, dan, seikai, kazu, mondai: 'RA1', ...extra });
await ok('H4：段は「正解が多い（3分の2以上）」が同じ段で2回続いたときだけ進み、下がらない。上限は段4', () => {
  const r = (hi, ...hitotsu) => ({ hi, hitotsu });
  assert.equal(danWoDasu([], 'yomu').dan, 1);
  assert.equal(danWoDasu([r('2026-11-01', hh('yomu', 1, 3))], 'yomu').dan, 1, '1回だけでは進まない');
  assert.equal(danWoDasu([r('2026-11-01', hh('yomu', 1, 3), hh('yomu', 1, 4))], 'yomu').dan, 2, '2回続けば進む');
  assert.equal(danWoDasu([r('2026-11-01', hh('yomu', 1, 3), hh('yomu', 1, 2), hh('yomu', 1, 3))], 'yomu').dan, 1, '間に少ない回があると数え直し');
  assert.equal(danWoDasu([r('2026-11-01', hh('yomu', 1, 3)), r('2026-11-02', hh('yomu', 1, 3))], 'yomu').dan, 2, '日をまたいでも続けて数える');
  // 下がらない：段2 に進んだあと、正解がほとんど無くても段2 のまま
  const x = [r('2026-11-01', hh('yomu', 1, 4), hh('yomu', 1, 4), hh('yomu', 2, 0), hh('yomu', 2, 0), hh('yomu', 2, 0))];
  assert.equal(danWoDasu(x, 'yomu').dan, 2);
  // 上限
  const zen = [r('2026-11-01', ...[1, 1, 2, 2, 3, 3, 4, 4, 4, 4].map((d) => hh('yomu', d, 4, 4, { oshita: 0 })))];
  assert.equal(danWoDasu(zen, 'yomu').dan, 4);
  assert.deepEqual(danWoDasu(zen, 'yomu').agari.map((a) => a.made), [2, 3, 4]);
  // 3問のひとつは2問正解で「多い」、2問のひとつは2問とも正解で「多い」
  assert.ok(ookattaKa(hh('yomu', 1, 2, 3)));
  assert.ok(!ookattaKa(hh('bun', 1, 1, 2)));
  assert.ok(ookattaKa(hh('bun', 1, 2, 2)));
  // ほかの出し方の練習は数えない
  assert.equal(danWoDasu([r('2026-11-01', hh('kiku', 1, 4), hh('kiku', 1, 4))], 'yomu').dan, 1);
});

await ok('H4：読む・聞くの段3 は、押した回数が2回以下のときだけ段4 に進む。読み上げが使えなかったひとつは数えない', () => {
  const r = (...hitotsu) => [{ hi: '2026-11-01', hitotsu }];
  const ue = [1, 1, 2, 2].map((d) => hh('yomu', d, 4));
  assert.equal(danWoDasu(r(...ue, hh('yomu', 3, 4, 4, { oshita: 3 }), hh('yomu', 3, 4, 4, { oshita: 3 })), 'yomu').dan, 3);
  assert.equal(danWoDasu(r(...ue, hh('yomu', 3, 4, 4, { oshita: 2 }), hh('yomu', 3, 4, 4, { oshita: 1 })), 'yomu').dan, 4);
  assert.equal(danWoDasu(r(hh('kiku', 1, 4, 4, { yomiageNashi: true }), hh('kiku', 1, 4, 4, { yomiageNashi: true })), 'kiku').dan, 1);
  // 文・図・一気には押すボタンが無いので、段3 の条件は正解だけ
  const b = [1, 1, 2, 2, 3, 3].map((d) => hh('bun', d, 2, 2));
  assert.equal(danWoDasu(r(...b), 'bun').dan, 4);
});

await ok('H4：育てる出し方は見つけたカードから。見つからない子は本人が選ぶ。区切っては練習しない', () => {
  const r = (y, k, n, hi) => ({ ...kaiA(y, k, n), hi });
  assert.deepEqual(sodateKouho([r([1, 1], [3, 3], 1, '2026-09-01')]), ['yomu'], '聞くカード → 読むを育てる');
  assert.deepEqual(sodateKouho([r([3, 3], [1, 1], 1, '2026-09-01')]), ['kiku'], '読むカード → 聞くを育てる');
  assert.equal(sodateKouho([r([2, 2], [2, 2], 1, '2026-09-01')]), null, 'どれでもの子は本人が選ぶ');
  assert.equal(jibunDeErabu([{ hi: '2026-11-01', jibun: 'zu', hitotsu: [] }]), 'zu');
  assert.ok(!SODATE_MODES.includes('kugiri'));
  assert.equal(hitotsuNoKazu(5), 2);
  assert.equal(hitotsuNoKazu(10), 4);
  assert.equal(hitotsuNoKazu(15), 6);
});

await ok('H4：練習の文は段階ごとにあり、棚と同じ作り。同じ文が続かない。置かない形が無い', () => {
  const pool = j('public/data/renshu.json');
  for (const [k, list] of [['A', pool.A.文章], ['B', pool.B.問題], ['C', pool.C.文章]]) {
    for (const d of [1, 2]) assert.ok(list.filter((x) => x.段階 === d).length >= 3, `${k} 段階${d}`);
    for (const x of list) assert.ok(x.下書き, `${x.id} は下書き`);
  }
  for (const p of pool.A.文章) {
    assert.equal(p.本文.length, p.段階 === 1 ? 3 : 4, p.id);
    assert.equal(p.問い.length, p.段階 === 1 ? 3 : 4, p.id);
  }
  for (const p of pool.C.文章) {
    assert.equal(p.連絡.length, p.問い.length, p.id);
    p.問い.forEach((q, i) => assert.ok(p.連絡[i].includes(q.本文の根拠), `${p.id} 問${i + 1} の答えは ${i + 1}文目にある（一文ずつ・二文ずつで出せる）`));
  }
  for (const p of pool.B.問題) {
    assert.equal(p.問い.length, p.段階 === 1 ? 1 : 2, p.id);
    assert.ok(p.要点 && p.言葉にする.選択肢[p.言葉にする.答え], p.id);
    assert.equal(p.図.べつ == null, p.段階 === 1, p.id);
  }
  const zenbu = JSON.stringify([pool.A, pool.B, pool.C]); // 説明の文（入れない形の名前を書いている）は除く
  for (const w of ['間違い探し', '違いを探', '覚えて', '数字タッチ', '目で追', '書き写', '記号']) assert.ok(!zenbu.includes(w), `置かない形：${w}`);
  // 同じ文が続かない・その段階のものだけ
  let rireki = [];
  const tsukatta = [];
  for (let i = 0; i < 8; i++) {
    const p = erabuMondai(pool, 'yomu', 1, rireki);
    assert.equal(p.段階, 1);
    if (tsukatta.length) assert.notEqual(p.id, tsukatta[tsukatta.length - 1]);
    tsukatta.push(p.id);
    rireki = [{ hi: '2026-11-01', hitotsu: tsukatta.map((m) => ({ mode: 'yomu', dan: 1, mondai: m, seikai: 0, kazu: 3 })) }];
  }
  assert.equal(new Set(tsukatta.slice(0, 4)).size, 4, 'はじめの4回は、4つとも別の文');
  assert.equal(erabuMondai(pool, 'ikki', 2, []).段階, 2);
  assert.ok(erabuMondai(pool, 'bun', 1, []).id.startsWith('RB'));
});

await ok('H4：そだてちゅうのカードは練習を始めると現れ、レベル＝段。段4 で一人前（育てたときの文と副題）', () => {
  const r = [{ hi: '2026-11-01', hitotsu: [1, 1, 2].map((d) => hh('yomu', d, 4)) }];
  const [c] = sodateCards(r);
  assert.equal(c.card, 'yomu');
  assert.equal(c.level, 2);
  assert.equal(c.ichininmae, false);
  assert.equal(levelNoNamae(cards, c), 'そだてちゅう');
  assert.equal(cardNoFukudai(cards, c), '聞くを支えに、読むを育てている');
  assert.match(sodateCardNoBun(cards, c).ひとこと, /育てている/);
  assert.equal(sodateCardNoBun(cards, c).名前, 'よんでスイッチ');
  const zen = [{ hi: '2026-11-01', hitotsu: [1, 1, 2, 2, 3, 3].map((d) => hh('yomu', d, 4, 4, { oshita: 0 })) }];
  const [d] = sodateCards(zen);
  assert.equal(d.level, 4);
  assert.equal(levelNoNamae(cards, d), '一人前');
  assert.equal(cardNoFukudai(cards, d), '聞くを支えに、読むを育てた');
  assert.match(sodateCardNoBun(cards, d).これは何か, /2回続けて正解が多く/);
  assert.equal(sodateCards([]).length, 0, '練習していなければ、育てるカードは無い');
  // カードの文に、効果をうたう言葉が無い
  for (const m of SODATE_MODES) {
    const t = JSON.stringify(cards.カード[m].育てたとき) + JSON.stringify(cards.カード[m].また見つけたとき);
    assert.ok(!/伸び|上がった|学力が上がる|成績/.test(t), m);
    assert.match(cards.カード[m].育てたとき.保護者向け, /学力への効果は確かめていません/);
  }
});

await ok('H4：今日の練習の選び方（予備は練習した日が少ない出し方）。段は Claude が変えない', async () => {
  const [st, r] = await handle('sodate', 'POST', { kouho: ['yomu', 'bun'], jokyou: [{ mode: 'yomu', dan: 2, hi: 3 }, { mode: 'bun', dan: 1, hi: 1 }] }, {});
  assert.equal(st, 200);
  assert.equal(r.mode, 'bun');
  assert.equal(r.dare, 'yobi');
  assert.match(r.riyuu, /2日目/);
  const [, r1] = await handle('sodate', 'POST', { kouho: ['kiku'], jokyou: [{ mode: 'kiku', dan: 2, hi: 1, tsuzuki: 1 }] }, {});
  assert.equal(r1.dare, 'kimari');
  assert.match(r1.riyuu, /同じ段でもう一度/);
  const [st2, r2] = await handle('sodate', 'POST', { kouho: ['nanika'] }, {});
  assert.equal(st2, 400);
  assert.match(r2.error, /育てる出し方/);
});

await ok('H4：子どもの練習の画面のもとに「苦手」と段階の名前が無い', () => {
  for (const f of ['public/js/sodateru_gamen.js', 'public/js/sodateru.js']) {
    const t = readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/苦手|やさしめ|むずかしめ|ふつうの文|3文の連絡|4文の連絡|物が1つの場面|物が2つの場面/.test(t), f);
  }
  assert.ok(!/苦手/.test(JSON.stringify(Object.values(DAN_NO_DASHIKATA))));
});

await ok('H5：また見つけるの日に、支えの出し方の差が出なかった出し方は一人前（そのときの文）。練習より前の日は数えない', () => {
  const r = (y, k, n, hi) => ({ ...kaiA(y, k, n), hi });
  const mae = r([1, 1], [3, 3], 1, '2026-09-01'); // 聞くの候補
  const renshu = [{ hi: '2026-10-01', hitotsu: [hh('yomu', 1, 2)] }];
  assert.deepEqual(ichininmaeOf([mae], renshu), []);
  assert.deepEqual(ichininmaeOf([mae, r([2, 2], [2, 2], 2, '2026-11-01')], renshu), ['yomu'], '後の日に差なし');
  assert.deepEqual(ichininmaeOf([mae, r([1, 1], [3, 3], 2, '2026-11-01')], renshu), [], 'まだ聞くの差がある');
  assert.deepEqual(ichininmaeOf([mae, r([2, 2], [2, 2], 2, '2026-09-15')], renshu), [], '練習より前の日の差なしは数えない');
  const [c] = sodateCards(renshu, ['yomu']);
  assert.equal(c.level, 4);
  assert.equal(c.kara, 'hr');
  assert.match(sodateCardNoBun(cards, c).これは何か, /また見つける/);
});

console.log(`\n${n} 件の確かめが通りました。`);
