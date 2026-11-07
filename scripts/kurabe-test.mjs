// 比べ方・カード・Claude の書き直しの流れを確かめる（キーは使わない）
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import * as fsAll from 'node:fs';
const require_fs = () => fsAll;
import path from 'node:path';
import { ROOT, seihon, tenkenAll } from '../lib/kotoba.mjs';
import { askClaude, niseNoClaude } from '../lib/claude.mjs';
import { motoNoKey } from '../public/js/kiroku.js';
import { keikakuNoKo, yobiKeikaku, kikanNoHi, shitaKoto } from '../public/js/keikaku.js';
import { keikakuNoZairyou, keikakuNoMondai } from '../lib/api.mjs';
import { kyouNoRiyuu, kyouNoRiyuuWoKaku } from '../public/js/sodateru.js';
import { sawaruTaishou, sawaruNoMasu, sawaruNoKekka, doreNashiWoTsukeru, ichininmaeNoKai, danWoDasu, ookattaKa, sodateKouho, erabuMondai, sodateCards, sodateCardNoBun, ichininmaeOf, hitotsuNoKazu, jibunDeErabu, SODATE_MODES, DAN_NO_DASHIKATA } from '../public/js/sodateru.js';
import { handle } from '../lib/api.mjs';
import { setteiWoIreru, maeTonoChigai, dankaiWoSusumeru, stepsOf, matome, matomeA, erabuCard, kouho, makeSteps, yobiNext, makeJunban, zenbuOf, mieruKoumoku, matomeKai, erabuCardKai, cardNoBun, motteiruCards, watasuCards, namaeWoAwaseru, cardNoFukudai, levelNoNamae, imaNoNamae, LEVEL_JOUGEN, claudeNiOkuru } from '../public/js/kurabe.js';

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

await ok('37便：画面に出さない作り手の言葉（揺れ・棚・〇便 など）が出ても、書き直しを頼む。決まりにも、その一覧と「専門の言葉を使わない」が入る', async () => {
  const { seisakuNoKotoba } = await import('../lib/kotoba.mjs');
  const c = nisemono([{ a: '同じ出し方での揺れより大きい差が出た（36便）' }, { a: '聞いて答えるとき、たまたまの違いより大きく、多く合っていました。' }]);
  const r = await askClaude({ env: {}, yakuwari: 'て', naiyou: {}, schema, client: c });
  assert.equal(r.ok, true);
  assert.equal(r.kaisu, 2);
  assert.match(c.okutta[1].messages[0].content, /「揺れ」が入っていました/);
  assert.match(c.okutta[1].messages[0].content, /「36便」が入っていました/);
  assert.ok(c.okutta[0].system.includes('画面に出さない作り手の言葉') && c.okutta[0].system.includes('専門の言葉を使わない'));
  // URL の中の docs/ や、ふつうの文には当たらない
  assert.equal(seisakuNoKotoba('https://platform.claude.com/docs/en/build-with-claude').length, 0);
  assert.equal(seisakuNoKotoba('読むと聞くを、順番を入れかえて2回ずつ試しました。').length, 0);
  // 画面のもとになるデータの言い方（Claude に渡すまとめ・前の回との違い・決まった文）にも、作り手の言葉が無い
  const okuru = claudeNiOkuru(demo.結果.デモ4.kai[2], j('public/data/tana.json'), [], demo.結果.デモ4.kai.map((x, i) => ({ ...x, kai: i + 1 })));
  assert.equal(JSON.stringify(okuru).match(/揺れ|素点|候補|向き/g), null, JSON.stringify(okuru).slice(0, 300));
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
  for (const w of ['ゲーム_つぎの一文', 'スイッチカードを受け取る', 'まとめと仮説', '回ごとの表', 'デモ5_差が出なかった子のカード']) {
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
  assert.match(bun4, /「聞く」ときのほうが多く合った（別々の日 3日のうち 3日）/);
  // 37便：引き継ぎの記録に、作り手の言葉（揺れ・候補の言い方・Should など）を出さない
  const { seisakuNoKotoba } = await import('../lib/kotoba.mjs');
  assert.equal(seisakuNoKotoba(bun4).length, 0);
  assert.ok(!/向きなし|その回の候補|くり返し出た候補/.test(bun4));
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
function hrWoSuru(junban, kotae, hoka = {}) {
  // kotae(step) → 正解の数。ゲームと同じく、1つ答えるごとに段階を進める
  const r = { junban, kekka: {}, ...hoka };
  for (let i = 0; i < 60; i++) {
    const id = yobiNext(r);
    if (!id) break;
    const st = stepsOf(r).find((x) => x.id === id);
    const kazu = st.kind === 'D' ? undefined : st.kind === 'B' ? 2 : st.renshu ? 4 : (st.dankai === 1 ? 3 : 4);
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
    assert.ok(!/段階|やさしめ|むずかしめ|ふつうの文|3文の連絡|4文の連絡|要素の少ない場面|要素の多い場面/.test(t.replace(/\/\/.*$/gm, '')), mei);
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
  assert.equal(levelNoNamae(cards, kiku([r1])), '見つけた');
  assert.equal(levelNoNamae(cards, kiku([r1, r2])), '確かめた');
  assert.equal(levelNoNamae(cards, kiku([r1, r2, r3])), 'しっかり');
  assert.deepEqual(motteiruCards([r1, r2, r3]).agatta, ['kiku'], '同じカードのレベルが進んだことは分かる');
  assert.equal(cards.カード.kiku.名前, '聞いてスイッチ');
  assert.equal(cardNoFukudai(cards, kiku([r1])), '読むと聞くを比べて');
  assert.equal(cardNoFukudai(cards, { card: 'dore' }), 'どれでも力が出た');
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
  // レベルの名前は、ふつうの言葉（「見つけた」など）とも重なるので、文字列として書いていないか（'見つけた' など）を見る
  const mojiretsu = (t, x) => [`'${x}'`, `"${x}"`, `\`${x}\``, `：${x}`].some((q) => t.includes(q));
  for (const x of [...Object.values(namae.レベル.見つけた), ...Object.values(namae.副題.見つけた), namae.副題.どれでも]) {
    for (const f of ['public/js/app.js', 'public/js/kurabe.js', 'lib/api.mjs']) assert.ok(!mojiretsu(readFileSync(path.join(ROOT, f), 'utf8'), x), `${f} に「${x}」を書かない`);
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
    assert.ok(['seki', 'hyou', 'jikanwari', 'tana'].includes(p.図.type) && p.題, `${p.id}：生活の場面の図（12便・13便のもとで作り直し）`);
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
  assert.equal(levelNoNamae(cards, c), '育て中');
  assert.equal(cardNoFukudai(cards, c), '聞くを支えに、読むを育てている');
  assert.match(sodateCardNoBun(cards, c).ひとこと, /育てている/);
  assert.equal(sodateCardNoBun(cards, c).名前, '読んでスイッチ');
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
  assert.match(r.riyuu, /2日目の 練習/);
  const [, r1] = await handle('sodate', 'POST', { kouho: ['kiku'], jokyou: [{ mode: 'kiku', dan: 2, hi: 1, tsuzuki: 1 }] }, {});
  assert.equal(r1.dare, 'kimari');
  assert.match(r1.riyuu, /前回は 正解が多かった。もう一回/);
  const [st2, r2] = await handle('sodate', 'POST', { kouho: ['nanika'] }, {});
  assert.equal(st2, 400);
  assert.match(r2.error, /育てる出し方/);
});

await ok('H4：子どもの練習の画面のもとに「苦手」と段階の名前が無い', () => {
  for (const f of ['public/js/sodateru_gamen.js', 'public/js/sodateru.js']) {
    const t = readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/苦手|やさしめ|むずかしめ|ふつうの文|3文の連絡|4文の連絡|要素の少ない場面|要素の多い場面/.test(t), f);
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

await ok('H5：⑦ また見つけるは3つの組だけ（練習と質問なし）で、前の回の段階から始める。回をまたいで比べ、カードが増えてレベルが進む', () => {
  // 1回目：段階1（練習が低い）で、聞くのほうが正解が多い
  const kiku = (st, kazu) => (st.renshu ? 1 : st.mode === 'kiku' ? kazu : Math.max(0, kazu - 2));
  const r1 = { ...hrWoSuru(makeJunban('また1'), kiku), kai: 1, hi: '2026-09-01', owari: true };
  assert.equal(r1.dankai.A.dankai, 1);
  // ⑦：kiroku.newKai と同じく、前の回の段階を写して始める
  const dankai = { erabikata: '前の回の段階から' };
  for (const k of ['A', 'B', 'C']) dankai[k] = { dankai: matome(r1, k).dankai };
  const r2 = { ...hrWoSuru(makeJunban('また2'), kiku, { shurui: 'mijikai', dankai }), kai: 2, hi: '2026-11-01', owari: true };
  const steps = stepsOf(r2);
  assert.equal(steps.length, 12, '3つの組（ABBA）×3');
  assert.ok(steps.every((x) => !x.renshu && x.kind !== 'D'));
  assert.equal(matome(r2, 'A').dankai, 1, '前の回の段階から');
  assert.equal(matome(r2, 'A').kekka, 'kiku');
  const x = matomeKai([r1, r2], 'A');
  assert.equal(x.kurikaeshi, 'kiku');
  const c = motteiruCards([r1, r2]).cards.find((m) => m.card === 'kiku');
  assert.equal(c.level, 2, 'レベル：たしかめた');
  // 前の回との違い（事実）
  const chigai = maeTonoChigai([r1, r2]);
  assert.equal(chigai.length, 3);
  assert.equal(chigai[0].mae, '「聞く」ときのほうが多い');
  // 3回目：差なしでも、カードは消えず、レベルは下がらない
  const r3 = { ...hrWoSuru(makeJunban('また3'), (st, kazu) => Math.ceil(kazu / 2), { shurui: 'mijikai', dankai }), kai: 3, hi: '2026-12-01', owari: true };
  const c3 = motteiruCards([r1, r2, r3]).cards.find((m) => m.card === 'kiku');
  assert.ok(c3 && c3.level >= 2);
  assert.equal(maeTonoChigai([r1, r2, r3])[0].ima, '同じくらい');
});

await ok('H5：⑦ の記録もサーバーが受け取れる（短い版の印と段階）', async () => {
  const dankai = { A: { dankai: 1 }, B: { dankai: 2 }, C: { dankai: 2 } };
  const r = { ...hrWoSuru(makeJunban('送る'), (st, kazu) => Math.ceil(kazu / 2), { shurui: 'mijikai', dankai }), kai: 2, hi: '2026-11-01' };
  const [st, out] = await handle('kasetsu', 'POST', { kai: [r], atehamaru: [] }, {});
  assert.equal(st, 200);
  assert.ok(out.kasetsu);
});

await ok('H6：学校の設定と、期間の計画（予備は決まった計画）。Claude に送るのは仮の番号だけ', async () => {
  const g = j('public/data/gakko.json');
  assert.deepEqual(g.選べるもの.朝の練習の長さ, [5, 10, 15]);
  assert.deepEqual(g.選べるもの.朝の練習の頻度, ['毎日', '週2', '週1']);
  assert.deepEqual(g.選べるもの.また見つけるの間隔, ['月1', '2か月', '学期']);
  assert.equal(kikanNoHi({ 朝の練習の頻度: '週2', また見つけるの間隔: '2か月' }), 16);
  assert.equal(kikanNoHi({ 朝の練習の頻度: '毎日', また見つけるの間隔: '月1' }), 20);
  const d7 = demo.結果.デモ7;
  const ko = [keikakuNoKo('子1', d7.kai, d7.renshu), keikakuNoKo('子2', demo.結果.デモ2.kai, []), keikakuNoKo('子3', [], [])];
  assert.ok(!JSON.stringify(ko).includes('デモ'), '呼び名を入れない');
  assert.deepEqual(ko[0].sodate.map((x) => [x.mode, x.dan]), [['yomu', 4]]);
  const y = yobiKeikaku(g.設定, ko);
  assert.equal(y.ko.length, 3);
  assert.match(y.ko[0].bun, /自分で読む/);
  assert.match(y.ko[1].bun, /本人が選んだ出し方/);
  assert.match(y.ko[2].bun, /まだゲーム/);
  assert.ok(!/苦手|上がる見込み/.test(JSON.stringify(y)));
  const [st, r] = await handle('keikaku', 'POST', { settei: { ...g.設定, 朝の練習の頻度: '毎日', HRの長さ: 999 }, kodomo: [...ko, { label: 'デモ1' }] }, {});
  assert.equal(st, 200);
  assert.equal(r.dare, 'yobi');
  assert.equal(r.ko.length, 3, '仮の番号でない子は受け取らない');
  assert.match(r.zentai, /毎日/);
  assert.equal(r.sankou, '参考程度・決めるのは先生');
  const [st2] = await handle('keikaku', 'POST', { kodomo: [] }, {});
  assert.equal(st2, 400);
});

await ok('H6：案内の時間の文は学校の設定から。子ども向けには時間を書かない', () => {
  const a = j('public/data/annai.json');
  const g = j('public/data/gakko.json');
  const ko = [...a.子ども.段, ...(a.子ども.画面 || [])].map((d) => d.文).join('');
  assert.ok(!/\{|\d+\s*分/.test(ko), '子ども向けに {…} や「〇分」が無い');
  assert.ok(!/検査の代わり/.test(ko), '子ども向けに「検査の代わり」の文は入れない');
  const hogo = a.保護者.段.map((d) => setteiWoIreru(d.文, { ...g.設定, 朝の練習の長さ: 15, 朝の練習の頻度: '週1', また見つけるの間隔: '学期' }, g.単位)).join('');
  assert.match(hogo, /HR（45分）/);
  assert.match(hogo, /週1回・1回15分/);
  assert.match(hogo, /学期ごとに、10分ほど/);
  assert.ok(!/\{/.test(hogo));
});

await ok('H6：大人の相談先は正本の大人用の文。子どもの文とは別', async () => {
  const sei = seihon();
  const otona = sei['相談先の案内（大人が試すとき・結果に関係なく同じ文）'];
  assert.ok(otona && otona !== sei['相談先の案内（結果に関係なく全員に同じ文）']);
  const [, jt] = await handle('joutai', 'GET', null, {});
  assert.equal(jt.soudanOtona, otona);
});

await ok('H6：⑤ に HR の冒頭で話すことの下書き（全員に同じ・時間を言い切らない）', async () => {
  const [, t1] = await handle('tsutae', 'POST', { kai: [demo.結果.デモ1.kai[0]] }, {});
  const [, t2] = await handle('tsutae', 'POST', { kai: demo.結果.デモ5.kai }, {});
  assert.ok(t1.hr && t1.hr === t2.hr, '結果に関係なく同じ');
  assert.ok(!/\d+\s*分/.test(t1.hr));
  assert.match(t1.hr, /今は答えない/);
});

await ok('H6：デモの子7（練習でカードが育った子）と8（やさしい段階で比べた子）。日付は 11/8 より前', () => {
  const d7 = demo.結果.デモ7;
  const sc = sodateCards(d7.renshu, ichininmaeOf(d7.kai, d7.renshu));
  assert.deepEqual(sc.map((c) => [c.card, c.level, c.kara]), [['yomu', 4, 'renshu']]);
  assert.ok(d7.renshu.some((r) => r.yasumi), '今日はやらない日もある');
  assert.equal(d7.kai[1].shurui, 'mijikai');
  const d8 = demo.結果.デモ8.kai[0];
  assert.ok(['A', 'B', 'C'].every((k) => matome(d8, k).dankai === 1));
  assert.equal(erabuCard(d8), 'zu');
  const hi = JSON.stringify(demo).match(/2026-\d\d-\d\d/g);
  assert.ok(hi.every((x) => x < '2026-11-08'), '日付は 2026-11-08 より前');
  assert.ok(demo.クラス.some((k) => /練習でカードが育った子/.test(k.呼び名)) && demo.クラス.some((k) => /やさしい問題で比べた子/.test(k.呼び名)));
});

await ok('8便 K2：段階1の棚 B は問い2つ（1つの出し方あたり4問）。答えは選択肢の中にある', () => {
  const t = j('public/data/tana.json');
  for (const id of ['B1Y', 'B2Y', 'B3Y', 'B4Y']) {
    const q = t.B.問題[id];
    assert.equal(q.問い.length, 2, id);
    assert.ok(q.下書き, id);
    q.問い.forEach((x) => assert.ok(x.選択肢[x.答え], id));
    assert.ok(q.図 && q.文, `${id}：文の版と図の版がある`);
  }
  // 段階1で比べても、各回の問いの数は2
  const r = hrWoSuru(makeJunban('B2問'), (st, kazu) => (st.renshu ? 1 : Math.ceil(kazu / 2)));
  assert.equal(matome(r, 'B').dankai, 1);
  assert.equal(matome(r, 'B').kazu, 2);
});

await ok('8便 K4：育てたカードが一人前になった回は「どれでも」を新しく出さない。前から持っている「どれでも」は消えない', () => {
  const r = (y, k, n, hi) => ({ ...kaiA(y, k, n), hi, owari: true });
  const mae = r([1, 1], [3, 3], 1, '2026-09-01'); // 聞くの候補
  const ato = r([2, 2], [2, 2], 2, '2026-11-01'); // 練習の後、差なし
  const renshu = [{ hi: '2026-10-01', hitotsu: [hh('yomu', 1, 2)] }];
  assert.deepEqual(ichininmaeNoKai([mae, ato], renshu), [{ mode: 'yomu', kai: 2 }]);
  const kai = doreNashiWoTsukeru([mae, ato], renshu);
  assert.deepEqual(motteiruCards(kai).cards.map((c) => c.card), ['kiku'], '「どれでも」が出ない');
  assert.deepEqual(motteiruCards([mae, ato]).cards.map((c) => c.card).sort(), ['dore', 'kiku'], '印が無ければ、いままでどおり');
  // 練習していなければ、印は付かない
  assert.ok(!doreNashiWoTsukeru([mae, ato], []).some((x) => x.doreNashi));
  // 前から持っている「どれでも」は消えない
  const dore0 = r([2, 2], [2, 2], 1, '2026-08-01');
  const k2 = doreNashiWoTsukeru([dore0, { ...mae, kai: 2 }, { ...ato, kai: 3 }], [{ hi: '2026-10-01', hitotsu: [hh('yomu', 1, 2)] }]);
  assert.ok(motteiruCards(k2).cards.some((c) => c.card === 'dore'));
  // デモ7：一人前になった日に「どれでも」が無い
  const d7 = demo.結果.デモ7;
  const k7 = doreNashiWoTsukeru(d7.kai.map((x, i) => ({ ...x, kai: x.kai ?? i + 1 })), d7.renshu);
  assert.ok(!motteiruCards(k7).cards.some((c) => c.card === 'dore'));
});

await ok('8便 K4：印はサーバーにも届き、伝え方の予備の文も「どれでも」にならない', async () => {
  const d7 = demo.結果.デモ7;
  const k7 = doreNashiWoTsukeru(d7.kai.map((x, i) => ({ ...x, kai: x.kai ?? i + 1 })), d7.renshu);
  const [, t] = await handle('tsutae', 'POST', { kai: k7 }, {});
  assert.equal(t.cardMei, '聞いてスイッチ');
});

await ok('8便 K3：練習の文に、測る棚と同じ話題が無い（⑦ の比べに、練習の記憶が混ざらないように）', () => {
  const pool = j('public/data/renshu.json');
  const renshu = JSON.stringify([pool.A.文章.map((x) => [x.本文, x.問い]), pool.B.問題.map((x) => [x.文, x.図, x.問い]), pool.C.文章.map((x) => [x.前おき, x.連絡, x.問い])]);
  // 測る棚（tana.json）の話題の言葉。練習の文には出さない
  const WADAI = ['パン屋', '図書館', '図書', '交換会', '犬', '兄', '姉', '花だん', 'チューリップ', '水やり', '牧場', '牛', '自転車', '打ち水', '商店街', '壁画', '美術', 'サッカー',
    'ノート', 'えんぴつ', 'シール', 'ジュース', '画用紙', '牛乳', 'おかし',
    '遠足', '理科', '実験', '体育祭', 'リレー', '校外学習', '博物館', '保健室', '身長', '体重', 'そうじ', 'ほうき', '朝の会', '上ばき', '体操服', '図書委員',
    // 12便：棚 B の生活の場面（教室の席・校舎の案内図・時間割・ロッカーの上の棚）
    '黒板', '校舎', '職員室', '音楽室', '美術室', '時間割', 'ロッカー', 'なわとび', 'うわばき', 'ぼうし', 'バケツ', 'タオル', 'ゴーグル',
    // 13便のもと：作り直した棚 B（当番表・時間割の持ち物・棚の物）
    '当番', '花の水', '配り', 'リコーダー', 'ぞうきん', 'はさみ', 'ふくろ'];
  for (const w of WADAI) assert.ok(!renshu.includes(w), `練習の文に「${w}」がある`);
  // 選択肢に同じものが2つ無い
  for (const x of [...pool.B.問題, ...pool.C.文章]) for (const q of x.問い) assert.equal(new Set(q.選択肢).size, q.選択肢.length, `${x.id} の選択肢が重なっている`);
});

await ok('8便 K3：練習の文（読む／聞く）の音声がそろっている（全文・前半・問い）', () => {
  const o = j('public/onsei/onsei.json').音声;
  const files = new Set(readdirSync(path.join(ROOT, 'public/onsei')).filter((f) => f.endsWith('.mp3')));
  for (const p of j('public/data/renshu.json').A.文章) {
    for (const t of [p.本文.join(''), p.本文.slice(0, Math.ceil(p.本文.length / 2)).join(''), ...p.問い.map((q) => q.文)]) {
      assert.ok(o[t] && files.has(o[t]), `${p.id}「${t.slice(0, 16)}…」の音声`);
    }
  }
});

// ---- 10便 M1：計画の言葉（回の種類・一人前）
const kodomoNoKeikaku = () => Object.values(demo.結果).map((k, i) => {
  const kai = doreNashiWoTsukeru(k.kai.map((r, n) => ({ ...r, kai: r.kai ?? n + 1 })), k.renshu || []);
  return keikakuNoKo(`子${i + 1}`, kai, k.renshu || []);
});
await ok('10便 M1：計画に渡す材料に、回の種類（HR のゲーム／また見つける）と回数・一人前かが入る', () => {
  const ko = kodomoNoKeikaku();
  const ids = Object.keys(demo.結果);
  const d1 = ko[ids.indexOf('デモ1')];
  const d4 = ko[ids.indexOf('デモ4')];
  const d7 = ko[ids.indexOf('デモ7')];
  assert.deepEqual([d1.gameKaisu, d1.mataKaisu], [1, 0]);
  assert.deepEqual([d4.gameKaisu, d4.mataKaisu], [3, 0]);
  assert.deepEqual([d7.gameKaisu, d7.mataKaisu], [1, 1]);
  assert.equal(d7.sodate[0].ichininmae, true);
  assert.match(shitaKoto(d1), /⑦ また見つける（短いゲーム）は、まだしていない/);
  const z = keikakuNoZairyou(j('public/data/gakko.json').設定, ko);
  assert.ok(!JSON.stringify(z).includes('デモ'), '呼び名を入れない');
  const z7 = z.子ども[ids.indexOf('デモ7')];
  assert.match(z7.したこと, /⑦ また見つける（短いゲーム）を1回/);
  assert.match(z7.育てる出し方[0].一人前, /^はい/);
});

await ok('10便 M1：予備の計画は、一人前の出し方を「続ける」と書かず、また見つけるをしていない子に「また見つけるで見つかった」と書かない', () => {
  const ko = kodomoNoKeikaku();
  const y = yobiKeikaku(j('public/data/gakko.json').設定, ko);
  const ids = Object.keys(demo.結果);
  const y7 = y.ko[ids.indexOf('デモ7')].bun;
  assert.match(y7, /一人前（段4・上限）で、この出し方の練習は終わっています。次に育てる出し方は先生が決めます/);
  assert.deepEqual(keikakuNoMondai(y, ko), [], '予備の計画は、取り違えの点検に通る');
  for (const x of y.ko) assert.ok(!/また見つける」?(の(ゲーム|回))?で[^。]*見つか(りました|った)/.test(x.bun), x.label);
});

await ok('10便 M1：公開デモで見た取り違え（1回の「また見つける」で見つかった／一人前を続ける）は書き直させる', async () => {
  const ko = kodomoNoKeikaku();
  const ids = Object.keys(demo.結果);
  const l1 = `子${ids.indexOf('デモ1') + 1}`;
  const l7 = `子${ids.indexOf('デモ7') + 1}`;
  const warui = {
    zentai: '学校の設定から、次の「また見つける」までの計画の案です。',
    ko: ko.map((k) => ({ label: k.label, bun: k.label === l1 ? '1回の「また見つける」で、聞くの候補が見つかりました。朝の練習で「自分で読む」を段1から。' : k.label === l7 ? 'いまの段は「読むだけ」。この段から続けて週2回・16日ほど練習する案です。' : '朝の練習の案です。' })),
  };
  const mondai = keikakuNoMondai(warui, ko);
  assert.equal(mondai.length, 2);
  assert.match(mondai.join(''), /まだしていません/);
  assert.match(mondai.join(''), /一人前で、練習は終わっています/);
  const yoi = { ...warui, ko: warui.ko.map((x) => (x.label === l1 ? { ...x, bun: 'HR のゲーム1回で、聞くの候補が出ました。朝の練習で「自分で読む」を段1から。' } : x.label === l7 ? { ...x, bun: '「自分で読む」は一人前。次に育てる出し方は先生が決めます。' } : x)) };
  const c = nisemono([warui, yoi]);
  niseNoClaude(c);
  const [st, r] = await handle('keikaku', 'POST', { settei: j('public/data/gakko.json').設定, kodomo: ko }, { ANTHROPIC_API_KEY: 'nise' }, 'test-keikaku');
  niseNoClaude(null);
  assert.equal(st, 200);
  assert.equal(r.dare, 'claude');
  assert.equal(r.tenken.kaisu, 2, '1回目は取り違えで書き直し、2回目で通る');
  assert.match(c.okutta[1].messages[0].content, /まだしていません/);
  // 頼み方（システムプロンプト）に、回の種類と一人前の決まりが入っている
  assert.match(c.okutta[0].system, /「② 見つける」は HR のゲーム、「⑦ また見つける」は間隔をあけてする短いゲームで、別のもの/);
  assert.match(c.okutta[0].system, /一人前：はい/);
});

await ok('10便 M1：計画の文も、言葉の正本で点検され、避ける言葉が出れば書き直させる', async () => {
  const ko = kodomoNoKeikaku();
  const yoi = { zentai: '次の「また見つける」までの計画の案です。', ko: ko.map((k) => ({ label: k.label, bun: '朝の練習の案です。' })) };
  const warui = { ...yoi, zentai: `この子たちは${sakeru}です。` };
  const c = nisemono([warui, yoi]);
  niseNoClaude(c);
  const [, r] = await handle('keikaku', 'POST', { kodomo: ko }, { ANTHROPIC_API_KEY: 'nise' }, 'test-keikaku2');
  niseNoClaude(null);
  assert.equal(r.dare, 'claude');
  assert.equal(r.tenken.kaisu, 2);
  assert.ok(!r.zentai.includes(sakeru));
});

await ok('10便 M2：覚えた文を使ってよいかの目印は、ゲームの回・練習の記録・チェック項目・学校の設定のどれかが変わると変わる', () => {
  const d7 = demo.結果.デモ7;
  const moto = { kai: d7.kai, renshu: d7.renshu, atehamaru: ['c04'], settei: j('public/data/gakko.json').設定 };
  const k0 = motoNoKey(moto);
  assert.equal(motoNoKey({ ...moto }), k0, '何も変わらなければ同じ（開き直しでは呼ばない）');
  assert.notEqual(motoNoKey({ ...moto, kai: [...d7.kai, { ...d7.kai[1], kai: 3, hi: '2026-11-04' }] }), k0, 'ゲームの回が増えた');
  assert.notEqual(motoNoKey({ ...moto, renshu: [...d7.renshu, { no: 99, hi: '2026-11-04', hitotsu: [] }] }), k0, '練習の記録が増えた');
  assert.notEqual(motoNoKey({ ...moto, renshu: d7.renshu.map((r, i) => (i === 0 ? { ...r, raku: '前より楽になった' } : r)) }), k0, '練習の記録の「楽になったか」が変わった');
  assert.notEqual(motoNoKey({ ...moto, atehamaru: ['c04', 'c14'] }), k0, 'チェック項目が変わった');
  assert.notEqual(motoNoKey({ ...moto, settei: { ...moto.settei, 朝の練習の長さ: 15 } }), k0, '学校の設定が変わった');
  assert.notEqual(motoNoKey({ ...moto, kai: d7.kai.map((r, i) => (i === 1 ? { ...r, doreNashi: true } : r)) }), k0, '一人前の印が付いた');
  // 覚える関数：予備の文（dare が claude でない）は覚えないことを、コードで確かめる
  const kiroku = readFileSync(path.join(ROOT, 'public/js/kiroku.js'), 'utf8');
  assert.match(kiroku, /if \(!value \|\| value\.dare !== 'claude'\) return value;/);
  assert.match(kiroku, /return c && c\.dare === 'claude' \? c : null;/);
});

await ok('11便 N3：保存した Claude の本物の文（デモの子8人・計画）は、避ける言葉0・R12 がそろい・手を入れた印が無い', () => {
  const h = j('public/data/demo_claude.json');
  const ids = Object.keys(demo.結果);
  assert.deepEqual(Object.keys(h.文).filter((k) => k !== '__クラス__').sort(), [...ids].sort(), 'デモの子8人ぶん');
  assert.equal(tenkenAll(h.文).length, 0, '言葉の正本で 0 件');
  for (const id of ids) {
    const { kasetsu: k, tsutae: t } = h.文[id];
    assert.equal(k.dare, 'claude', id);
    assert.equal(t.dare, 'claude', id);
    assert.match(k.kasetsu, /かも/, `${id}：仮説の形`);
    assert.match(k.tsugi, /^次に試すなら/, `${id}：次に試すなら`);
    assert.ok(k.kakunin && Number.isInteger(k.kakunin.回), `${id}：確かめた回数`);
    assert.equal(k.sankou, '参考程度・決めるのは先生', `${id}：参考程度・決めるのは先生`);
    assert.equal(t.sankou, '参考程度・決めるのは先生', id);
    assert.equal(k.kaitaHi, '2026-11-08');
    for (const f of ['kondan', 'hogosha', 'hitokoto', 'hr', 'cardMei']) assert.ok(t[f], `${id}：伝え方の ${f}`);
    // 確かめた回数は、記録の回の数と同じ
    assert.equal(k.kakunin.回, demo.結果[id].kai.length, `${id}：確かめた回数が記録と合う`);
  }
  const kk = h.文.__クラス__.keikaku;
  assert.deepEqual(kk.ko.map((x) => x.label), ['子1', '子2', '子3', '子4', '子5', '子6', '子7', '子8'], '計画は子1〜子8');
  assert.equal(kk.sankou, '参考程度・決めるのは先生');
  assert.match(h.印, /2026-11-08 に書いた下書き（保存したもの）/);
  assert.deepEqual(keikakuNoMondai(kk, kodomoNoKeikaku()), [], '保存した計画は、10便の取り違えの点検にも通る');
});

await ok('12便 P5：時間の起点は3つの棚でそろう（問題が画面に出たとき）。聞いた回数を記録に残す。先生の画面の秒に「参考」', () => {
  const g = readFileSync(path.join(ROOT, 'public/js/game.js'), 'utf8');
  const kansu = (mei) => g.slice(g.indexOf(`function ${mei}(`), g.indexOf('\nfunction ', g.indexOf(`function ${mei}(`) + 10));
  for (const mei of ['bunshoMondai', 'bamenMondai', 'shijiMondai']) {
    const k = kansu(mei);
    assert.match(k, /const t0 = performance\.now\(\);/, `${mei}：はじめに時計を始める`);
    assert.ok(k.indexOf('const t0 = performance.now();') < k.indexOf('box.innerHTML'), `${mei}：問題を出す前に時計を始める`);
    assert.match(k, /kiten: 'hyouji'/, `${mei}：起点の印`);
  }
  assert.ok(!/if \(!t0\) t0 = performance\.now\(\)/.test(g), '問いが出てから始める前の数え方は残っていない');
  assert.match(kansu('bunshoMondai'), /kikuKaisu, toiKikuKaisu/);
  assert.match(readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8'), /かかった時間（参考）/);
});

await ok('12便 P3：棚 B は生活の場面の文／図問題（段階1・2 各4題・問い2つ・4択）。式・計算・探す・照合・時間制限が無い', () => {
  const t = j('public/data/tana.json');
  const B = t.B.問題;
  for (const d of [1, 2]) assert.equal(Object.values(B).filter((x) => x.段階 === d).length, 4, `段階${d} は4題`);
  const zen = JSON.stringify(B);
  assert.ok(!/[0-9０-９]x|x[＋＝+=]|＝|代金|計算|式/.test(zen), '式・計算が無い');
  for (const w of ['探', '照合', '見本', '間違い', 'ちがいを', '回転', '写す', '秒', '時間内', 'できるだけ速く']) assert.ok(!zen.includes(w), `入れない形：${w}`);
  // 図に出てくる名前（値の文字列だけ。キーと種類の名前・時間の番号・空き・空の欄は除く）
  const mei = (z) => {
    const out = [];
    const walk = (o, key) => {
      if (Array.isArray(o)) o.forEach((v) => walk(v, key));
      else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => walk(v, k));
      else if (typeof o === 'string' && o && !['type', 'mei'].includes(key) && !/^\d+$/.test(o)) out.push(o);
    };
    walk(z, '');
    return out;
  };
  for (const [id, q] of Object.entries(B)) {
    assert.equal(q.問い.length, 2, id);
    for (const x of q.問い) {
      assert.equal(x.選択肢.length, 4, id);
      assert.equal(new Set(x.選択肢).size, 4, `${id}：選択肢が重ならない`);
      assert.ok(x.選択肢[x.答え], id);
    }
    assert.ok(['seki', 'hyou', 'jikanwari', 'tana'].includes(q.図.type), id);
    // 文の版と図の版に同じ内容：図に出てくる名前（人・部屋・教科・物）は、すべて文にもある
    for (const n of mei(q.図).filter((x) => !['type', 'seki', 'hyou', 'jikanwari', 'tana', 'mae', 'retsu', 'mei', 'youbi', 'motsu', 'jikan', 'hi', 'kakari', 'dare', 'iikata', 'shihou', '1', '2', '3', '4', '5', ''].includes(x))) {
      assert.ok(q.文.includes(n.replace(/ /g, '')) || q.文.includes(n), `${id}：図の「${n}」が文にもある`);
    }
    assert.ok(!/(?<!階)段(?!目)/.test(q.文 + JSON.stringify(q.問い)), `${id}：子どもの画面に出る文に「段」が無い`);
  }
  assert.deepEqual(t.段階.名前.B, { 1: '要素の少ない場面（席4つ・当番4つ など）', 2: '要素の多い場面（席12・当番12 など）' });
  // 段階1は要素が少なく、段階2は多い
  const kazu = (z) => mei(z).length;
  for (const k of ['seki', 'hyou', 'jikanwari', 'tana']) {
    const ichi = Object.values(B).find((x) => x.段階 === 1 && x.図.type === k);
    const ni = Object.values(B).find((x) => x.段階 === 2 && x.図.type === k);
    assert.ok(kazu(ichi.図) < kazu(ni.図), `${k}：段階1のほうが要素が少ない`);
  }
});

await ok('12便 P4（Should）：図を触るは、文・図の練習の段1〜2の、座席・棚の場面だけ。置いた結果と直した回数を数える。段の決まりは変えない', () => {
  const pool = j('public/data/renshu.json');
  const rb = (id) => pool.B.問題.find((x) => x.id === id);
  assert.ok(sawaruTaishou('bun', 1, rb('RB1').図));
  assert.ok(sawaruTaishou('zu', 2, rb('RB3').図));
  assert.ok(!sawaruTaishou('bun', 3, rb('RB1').図), '段3からは無い');
  assert.ok(!sawaruTaishou('yomu', 1, rb('RB1').図), '文・図の練習だけ');
  assert.ok(!sawaruTaishou('bun', 1, rb('RB2').図), '表（家の お手伝い表）は、置く形の対象にしない');
  const m = sawaruNoMasu(rb('RB1').図);
  assert.equal(m.masu.filter((x) => x.kotae != null).length, 6);
  const seikai = Object.fromEntries(m.masu.filter((x) => x.kotae != null).map((x) => [`${x.i}-${x.j}`, x.kotae]));
  assert.deepEqual(sawaruNoKekka(rb('RB1').図, seikai, 2), { kazu: 6, atta: 6, naoshi: 2 });
  assert.equal(sawaruNoKekka(rb('RB1').図, { ...seikai, '0-0': 'かな', '0-1': 'ゆう' }, 0).atta, 4);
  // 図を触った記録があっても、段の決まりは変わらない（正解の数だけで決まる）
  const r = [{ hi: '2026-11-04', hitotsu: [1, 1].map((d) => ({ mode: 'bun', dan: d, seikai: 2, kazu: 2, mondai: 'RB1', sawaru: { kazu: 5, atta: 1, naoshi: 9 } })) }];
  assert.equal(danWoDasu(r, 'bun').dan, 2);
  assert.equal(j('public/data/should.json').zuWoSawaru.使う, true, 'should.json で外せる');
});

await ok('12便のあと：カードの名前を漢字にした（先生の決定）。保存した Claude の文の見出しに前の名前が残っても、画面は今の名前。本文は書きかえない', () => {
  const cs = namaeWoAwaseru(j('public/data/cards.json'), j('public/data/card_namae.json'));
  const mei = { kiku: '聞いてスイッチ', yomu: '読んでスイッチ', zu: '図でスイッチ', bun: '文でスイッチ', kugiru: '区切ってスイッチ', ikki: '一気にスイッチ' };
  for (const [id, m] of Object.entries(mei)) assert.equal(cs.カード[id].名前, m);
  assert.equal(imaNoNamae(cs, 'きいてスイッチ'), '聞いてスイッチ');
  assert.equal(imaNoNamae(cs, 'ずでスイッチ'), '図でスイッチ');
  assert.equal(imaNoNamae(cs, 'どれでもスイッチ'), 'どれでもスイッチ', '変えていない名前はそのまま');
  // 39便：保存した文は 2026-11-08 に取り直したので、本文に前の名前は残っていない（残っていても、見出しは今の名前で出す作りはそのまま）
  const hozon = JSON.stringify(j('public/data/demo_claude.json'));
  for (const mae of Object.keys(cs.前の名前 || {}).filter((k) => k !== '説明')) assert.ok(!hozon.includes(`「${mae}」`), `保存した本文に前の名前「${mae}」が無い`);
});

// ---- 13便のもと：棚 B と練習 B を、先生の基準で機械でも確かめる
// 問いの言い方は決まった形だけ。図のデータから答えを解き直し、①答えが一つ ②答えのしるしと同じ ③選択肢はどれも場面の中にある ④向き・視点の言葉が無い
export function bamenWoToku(z, bun) {
  const m = (re) => bun.match(re);
  const n = (s) => Number(String(s).replace(/[０-９]/g, (c) => '０１２３４５６７８９'.indexOf(c)));
  const rows = z.type === 'seki' ? z.retsu : z.type === 'tana' ? z.tana : null;
  let r;
  if (rows && (r = m(/^前から (\d)列めの、左から (\d)番めは だれ？$/) || m(/^上から (\d)つめの たなの、左から (\d)番めは？$/))) return [rows[n(r[1]) - 1]?.[n(r[2]) - 1]];
  if (rows && (r = m(/^(.+?)(?:さん)?と 同じ(?:列| たな)で、左から (\d)番めは(?: だれ)?？$/))) return rows.filter((row) => row.includes(r[1])).map((row) => row[n(r[2]) - 1]);
  // 2×2（iikata: shihou）：「右後ろの 席は だれ？」「さきさんの 席は どこ？」「右上に あるのは？」「ボールは どこ？」
  if (rows && z.iikata === 'shihou') {
    const tate = z.type === 'tana' ? ['上', '下'] : ['前', '後ろ'];
    const yobi = (i, j) => `${['左', '右'][j]}${tate[i]}`;
    const ichi = [0, 1].flatMap((i) => [0, 1].map((j) => ({ i, j, mei: yobi(i, j), mono: rows[i][j] })));
    if ((r = m(/^(左|右)(前|後ろ)の 席は だれ？$/) || m(/^(左|右)(上|下)に あるのは？$/))) return ichi.filter((x) => x.mei === r[1] + r[2]).map((x) => x.mono);
    if ((r = m(/^(.+?)(?:さんの 席)?は どこ？$/))) return ichi.filter((x) => x.mono === r[1]).map((x) => x.mei);
  }
  if (z.type === 'hyou') {
    const yobi = (h) => `${h}曜日`;
    if ((r = m(/^(.)曜日の (.+?)は だれ？$/))) return z.kakari.filter((k) => k.mei === r[2]).map((k) => k.dare[z.hi.indexOf(r[1])]);
    if ((r = m(/^(.+?)さんの (?:当番|お手伝い)は 何曜日？$/))) return z.kakari.flatMap((k) => k.dare.map((d, i) => (d === r[1] ? yobi(z.hi[i]) : null))).filter(Boolean);
    if ((r = m(/^(.+?)さんの (?:当番|お手伝い)は？$/))) return z.kakari.flatMap((k) => k.dare.map((d, i) => (d === r[1] ? `${yobi(z.hi[i])}の ${k.mei}` : null))).filter(Boolean);
  }
  if (z.type === 'jikanwari') {
    if ((r = m(/^(\d)時間目は どこで する？$/))) return [z.jikan[n(r[1]) - 1]?.[2]];
    if ((r = m(/^(.+?)を 持っていくのは 何時間目？$/))) return z.jikan.filter((j) => j[3] === r[1]).map((j) => `${j[0]}時間目`);
    if ((r = m(/^(.+?)で するのは 何時間目？$/))) return z.jikan.filter((j) => j[2] === r[1]).map((j) => `${j[0]}時間目`);
  }
  return null;
}

await ok('13便のもと：棚 B の8題と練習 B の6題は、図から解き直すと答えが一つで、しるしと同じ。選択肢はどれも場面の中。向きや視点の推測が要る言葉が無い', () => {
  const tana = j('public/data/tana.json');
  const pool = j('public/data/renshu.json');
  const zenbu = [...Object.entries(tana.B.問題).map(([id, q]) => ({ id, ...q })), ...pool.B.問題];
  assert.equal(zenbu.length, 14);
  const MUKI = ['すぐ前', 'すぐ後ろ', 'すぐ下', 'すぐ上', 'となり', 'ななめ', '向いて', '向き', '下りて', '上って', '進んで', 'つきあたり', 'どちら', '入口', '階段', '北', '南', '移動'];
  for (const p of zenbu) {
    const ba = JSON.stringify(p.図) + p.文;
    for (const x of p.問い) {
      for (const w of MUKI) assert.ok(!x.文.includes(w), `${p.id}「${x.文}」：向き・視点の言葉「${w}」`);
      const kotae = bamenWoToku(p.図, x.文);
      assert.ok(kotae, `${p.id}「${x.文}」：決まった言い方の問い`);
      assert.equal(kotae.length, 1, `${p.id}「${x.文}」：答えが一つに決まる`);
      assert.equal(x.選択肢[x.答え], kotae[0], `${p.id}「${x.文}」：答えのしるしが図と合う`);
      assert.equal(x.選択肢.filter((c) => c === kotae[0]).length, 1, `${p.id}：正しい選択肢は1つだけ`);
      for (const c of x.選択肢) {
        const ari = ba.includes(c) || /^\d時間目$/.test(c) && p.図.jikan?.some((jj) => `${jj[0]}時間目` === c) || /^(.)曜日(の (.+))?$/.test(c) && p.図.hi?.includes(c[0]) && (!c.includes('の ') || p.図.kakari.some((k) => c.endsWith(`の ${k.mei}`)));
        assert.ok(ari, `${p.id}「${x.文}」：選択肢「${c}」が場面の中にある`);
      }
    }
    // 文の版にも、図と同じ基準の言い方がある
    if (p.図.iikata === 'shihou') {
      // 2×2 は「左前・右後ろ」「右上・左下」の言い方（先生の決定）。「左から 〇番め」は使わない
      assert.ok(p.図.type === 'seki' ? /左前は .+右後ろは/.test(p.文) : /左上に .+右下に/.test(p.文), `${p.id}：2×2 の言い方が文にある`);
      assert.ok(!/左から/.test(JSON.stringify(p.問い)), `${p.id}：2×2 で「左から 〇番め」を使わない`);
    } else {
      if (p.図.type === 'seki') assert.ok(/前から 1列めは、左から/.test(p.文), `${p.id}：文にも「前から 〇列め」「左から」`);
      if (p.図.type === 'tana') assert.ok(/上から 1つめは、左から/.test(p.文), `${p.id}：文にも「上から 〇つめ」「左から」`);
    }
    if ((p.図.retsu || p.図.tana)?.length === 2 && (p.図.retsu || p.図.tana).every((r) => r.length === 2)) assert.equal(p.図.iikata, 'shihou', `${p.id}：2×2 は左前・右上の言い方にする`);
  }
  // 答えの位置がかたよらない（測る棚の16問で、どの位置も2回以上）
  const ichi = [0, 0, 0, 0];
  for (const q of Object.values(tana.B.問題)) for (const x of q.問い) ichi[x.答え]++;
  assert.ok(ichi.every((c) => c >= 2), `答えの位置のかたより：${ichi.join('・')}`);
});

// ---- 21便
await ok('21便 U2：「〇日目」は今日を含めて練習した日数。同じ日の2回目では足さない（予備の yobiSodate も同じ）', async () => {
  const KYOU = '2026-11-06';
  const hiOf = (n, kyou) => [...Array.from({ length: n }, (_, i) => `2026-10-0${i + 1}`), ...(kyou ? [KYOU] : [])]
    .map((hi, i) => ({ no: i, hi, hitotsu: [{ mode: 'kiku', dan: 1, seikai: 1, kazu: 4 }] }));
  const hyou = [
    [0, false, 'はじめての 練習。'],
    [0, true, 'はじめての 練習。'],
    [1, false, '2日目の 練習。'],
    [1, true, '2日目の 練習。'],
    [2, true, '3日目の 練習。'],
  ];
  for (const [mae, kyou, kitai] of hyou) {
    const renshu = hiOf(mae, kyou);
    const hi = mae + (kyou ? 1 : 0);
    assert.equal(kyouNoRiyuuWoKaku(hi, 0, 1, kyou), kitai, `決まった文：前に${mae}日・今日${kyou ? 'あり' : 'まだ'}`);
    assert.equal(kyouNoRiyuu('kiku', renshu, KYOU), kitai, `子どもの画面の予備：前に${mae}日・今日${kyou ? 'あり' : 'まだ'}`);
    const [st, r] = await handle('sodate', 'POST', { kouho: ['kiku'], jokyou: [{ mode: 'kiku', dan: 1, hi, tsuzuki: 0, kyouAri: kyou }] }, {});
    assert.equal(st, 200);
    assert.equal(r.riyuu, kitai, `サーバーの予備（yobiSodate）：前に${mae}日・今日${kyou ? 'あり' : 'まだ'}`);
  }
});

// ---- 36便
await ok('36便：短い体験は、棚 A・B・C の 1組目の2つずつ（6つ）だけ。練習・質問なし・段階は 2 で固定・切りかえなし・候補を言い切らない。本番の並びは変わらない', async () => {
  const k = await import('../public/js/kurabe.js');
  const j = k.makeJunban('体験-1');
  const dankai = { A: { dankai: 2 }, B: { dankai: 2 }, C: { dankai: 2 } };
  const st = k.makeSteps(j, dankai, 'taiken');
  assert.deepEqual(st.map((x) => x.id), ['A-1', 'A-2', 'B-1', 'B-2', 'C-1', 'C-2']);
  assert.ok(st.every((x) => x.dankai === 2 && !x.renshu && x.kind !== 'D'));
  // 本番（22組）と「また見つける」（12組）は、前と同じ
  assert.equal(k.makeSteps(j, dankai, 'hr').length, 22);
  assert.equal(k.makeSteps(j, dankai, 'mijikai').length, 12);
  // 全部 0 問正解でも段階を変えない。最初に出せるのは A・B・C の頭（練習を待たない）
  const rec = { id: '体験9', shurui: 'taiken', junban: j, dankai: JSON.parse(JSON.stringify(dankai)), kekka: {} };
  assert.deepEqual(k.kouho(rec).sort(), ['A-1', 'B-1', 'C-1']);
  for (const x of st) rec.kekka[x.id] = { seikai: 0, kazu: x.kind === 'B' ? 2 : 4 };
  assert.deepEqual(k.dankaiWoSusumeru(rec), []);
  assert.ok(!['A', 'B', 'C'].some((t) => rec.dankai[t].kirikae));
  assert.ok(k.owatta(rec));
  // 2つだけでは、どの棚も候補を言い切らない（まだ比べていない）
  for (const t of ['A', 'B', 'C']) assert.ok(!['kiku', 'yomu', 'zu', 'bun', 'ikki', 'kugiri'].includes(k.matome(rec, t).kekka), t);
});

// ---- 39便：38便で足した docs の文書（制作の過程）は、リンクが切れていない。避ける言葉は scripts/tenken.mjs で見る
export const DOCS_KATEI = ['README.md', '制作の流れ.md', '検収のしかた.md', '先生の判断の記録.md', '調べたこと.md', '専門家の意見について.md'];
export function linkGire(file) {
  const t = readFileSync(file, 'utf8');
  return [...t.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u))
    .filter((u) => !existsSync(path.resolve(path.dirname(file), decodeURI(u))));
}
await ok('39便：docs の制作の過程の文書（入口・流れ・検収・先生の判断・調べたこと・専門家の意見について）と README に、切れたリンクが無い', () => {
  for (const f of [...DOCS_KATEI.map((x) => path.join(ROOT, 'docs', x)), path.join(ROOT, 'README.md')]) assert.deepEqual(linkGire(f), [], f);
  // 切れたリンクを見つけられること（わざと切れたリンクを書いた文で確かめる）
  const tmp = path.join(ROOT, 'docs', '.linkgire_tameshi.md');
  writeFileSync(tmp, '[無い](無いファイル.md)');
  try { assert.deepEqual(linkGire(tmp), ['無いファイル.md']); } finally { unlinkSync(tmp); }
});

await ok('40便：「はじめからやり直す」は、途中の回だけを消してはじめからにする。終わった回は消さない・変えない。短いゲームと体験の種類はそのまま', async () => {
  const kr = await import('../public/js/kiroku.js');
  const id = kr.newKid('その場');
  const st = kr.load();
  const r1 = st.kids[id].kai[0];
  r1.kekka = { 'A-1': { seikai: 3, kazu: 4 } };
  r1.owari = true;
  kr.saveRecord(r1);
  const owattaMae = JSON.stringify(kr.load().kids[id].kai[0]);
  assert.equal(kr.yarinaoshi(id), false, '終わった回は、やり直しで消さない');
  assert.equal(kr.tochuNoGame(id), false);
  assert.ok(kr.newKai(id, 'mijikai'));
  const r2 = kr.load().kids[id].kai[1];
  r2.kekka = { 'A-1': { seikai: 1, kazu: 4 } };
  kr.saveRecord(r2);
  assert.equal(kr.tochuNoGame(id), true);
  assert.ok(kr.yarinaoshi(id));
  const ato = kr.load().kids[id];
  assert.equal(ato.kai.length, 2, '回の数は変わらない');
  assert.deepEqual(ato.kai[1].kekka, {}, '途中までの答えは消える');
  assert.equal(ato.kai[1].kai, 2);
  assert.equal(ato.kai[1].shurui, 'mijikai', '短いゲームのまま');
  assert.equal(JSON.stringify(ato.kai[0]), owattaMae, '終わった回は変わらない');
  const t = kr.newTaiken();
  const rt = kr.load().kids[t].kai[0];
  rt.kekka = { 'A-1': { seikai: 2, kazu: 4 } };
  kr.saveRecord(rt);
  assert.ok(kr.yarinaoshi(t));
  const rt2 = kr.load().kids[t].kai[0];
  assert.equal(rt2.shurui, 'taiken');
  assert.deepEqual(rt2.kekka, {});
  assert.equal(rt2.dankai.A.dankai, 2, '体験の段階は「ふつう」のまま');
  assert.equal(kr.yarinaoshi('デモ1'), false, '架空の子の記録は変えない');
});

console.log(`\n${n} 件の確かめが通りました。`);
