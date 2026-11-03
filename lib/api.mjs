// サーバー側の関数の中身。手元のサーバー（server.mjs）と Vercel（api/[name].js）の両方から呼ぶ。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, tenken, tenkenAll, soudanSaki } from './kotoba.mjs';
import { askClaude } from './claude.mjs';
import { yobiKasetsu, yobiTsutae, konkyoList, SANKOU, yobiNextLabel } from './yobi.mjs';
import { kouho, yobiNext, yobiRiyuu, stepOf, matome, erabuCardKai, cardNoBun, claudeNiOkuru, KUMI, DASHIKATA, mieruKoumoku } from '../public/js/kurabe.js';

const dataCache = {};
function data(name) {
  if (!dataCache[name]) dataCache[name] = JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', `${name}.json`), 'utf8'));
  return dataCache[name];
}

// 公開デモの回数上限（1つの接続元あたり、1時間に何回 Claude を呼べるか）
const kaisuKiroku = new Map();
function jougenOK(env, ip) {
  const max = Number(env.DEMO_KAISU_JOUGEN || 60);
  const now = Date.now();
  const arr = (kaisuKiroku.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= max) {
    kaisuKiroku.set(ip, arr);
    return false;
  }
  arr.push(now);
  kaisuKiroku.set(ip, arr);
  return true;
}

function yobiWake(env, ip) {
  if (!env.ANTHROPIC_API_KEY) return 'API キーが無いので、決まった順の予備の動きで出しています。';
  if (!jougenOK(env, ip)) return '回数の上限に達したので、決まった順の予備の動きで出しています。';
  return null;
}

// 受け取った記録の形を確かめる（名前などは受け取らない）
function seiri(record) {
  if (!record || typeof record !== 'object') throw new Error('記録がありません');
  const j = record.junban;
  const junban = {};
  for (const kind of ['A', 'B', 'C']) {
    const x = j?.[kind];
    if (!x || !KUMI[kind].includes(x.saisho)) throw new Error('順番の形が違います');
    junban[kind] = { saisho: x.saisho, irekae: !!x.irekae };
  }
  const kekka = {};
  for (const [k, v] of Object.entries(record.kekka || {})) {
    if (!/^(A-r[12]|[ABC]-[1-4]|D[1-4])$/.test(k)) continue;
    kekka[k] = {
      seikai: Number.isFinite(v?.seikai) ? v.seikai : undefined,
      kazu: Number.isFinite(v?.kazu) ? v.kazu : undefined,
      ms: Number.isFinite(v?.ms) ? v.ms : undefined,
      mikaeshi: Number.isFinite(v?.mikaeshi) ? v.mikaeshi : undefined,
      yomiageNashi: v?.yomiageNashi ? true : undefined,
      kotae: typeof v?.kotae === 'string' ? v.kotae.slice(0, 40) : undefined,
    };
  }
  return { junban, kekka, kai: Number.isInteger(record.kai) ? record.kai : undefined };
}

// 回の並び（同じ子の、終わった回）。無ければ record だけを1回目とする
function seiriKai(body) {
  const arr = Array.isArray(body.kai) && body.kai.length ? body.kai.slice(-12) : [body.record];
  return arr.map((r, i) => ({ ...seiri(r), kai: Number.isInteger(r?.kai) ? r.kai : i + 1 }));
}

function atehamaruText(ids) {
  const items = mieruKoumoku(data('checklist'));
  return (Array.isArray(ids) ? ids : []).map((id) => items.find((x) => x.id === id)?.文).filter(Boolean);
}

async function tsugi(body, env, ip) {
  const record = seiri(body.record);
  const c = kouho(record);
  if (c.length === 0) return { owari: true };
  const yobi = () => {
    const id = yobiNext(record);
    return { next: id, riyuu: yobiRiyuu(record, id), dare: 'yobi' };
  };
  if (c.length === 1) {
    // 選ぶ余地が無いとき（練習）は、Claude を呼ばずに決まった文を出す
    const r = yobi();
    return { ...r, dare: 'kimari', wake: '練習は決まった順です。' };
  }
  const wake = yobiWake(env, ip);
  if (wake) return { ...yobi(), wake };

  const kore = Object.entries(record.kekka).map(([id, k]) => {
    const st = stepOf(record, id);
    return { id, 中身: yobiNextLabel(id, st), 結果: st.kind === 'D' ? '答えた' : `${k.seikai}／${k.kazu}問` };
  });
  const naiyou = {
    次に出してよいもの: c.map((id) => ({ id, 中身: yobiNextLabel(id, stepOf(record, id)) })),
    これまでに出したもの_順に: kore,
    決まった順の例: '練習の後は、読む・聞くを1つ→質問→読む・聞く→図→…のように、種類を混ぜる',
  };
  const schema = {
    type: 'object',
    properties: { next: { type: 'string', enum: c }, riyuu: { type: 'string' } },
    required: ['next', 'riyuu'],
    additionalProperties: false,
  };
  const yakuwari = [
    'ゲームの中で、次に出す問題を「次に出してよいもの」の中から1つ選び、その理由を書きます。',
    '理由は、ゲームをしている中学生本人の画面にそのまま出ます。1〜2文、60字以内で、やさしい言葉で書いてください。',
    '理由には、正解の数や、どの出し方がよかったかを書かないでください（本人に途中の結果を伝えない）。ほめる・評価する言葉も入れないでください。',
    '選ぶときの考え方：同じ種類が3つ以上続かないようにする。問題の間に「選んで答える質問」をはさむ。読む・聞くの組は、途中で間が空きすぎないようにする。',
  ].join('\n');
  const r = await askClaude({
    env,
    yakuwari,
    naiyou,
    schema,
    kensa: (o) => {
      const m = [];
      if (!c.includes(o.next)) m.push('next は「次に出してよいもの」の id から選んでください。');
      if ((o.riyuu || '').length > 80) m.push('理由を60字以内にしてください。');
      if (/正解|まちが|間違|よくでき|すごい/.test(o.riyuu || '')) m.push('理由に、結果やほめ言葉を書かないでください。');
      return m;
    },
  });
  if (!r.ok) return { ...yobi(), wake: `Claude が使えなかったので（${r.wake}）、決まった順の予備の動きで出しています。` };
  return { next: r.obj.next, riyuu: r.obj.riyuu, dare: 'claude', tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

async function kasetsu(body, env, ip) {
  const kaiList = seiriKai(body);
  const record = kaiList[kaiList.length - 1];
  const tana = data('tana');
  const atehamaru = atehamaruText(body.atehamaru);
  // 確かめた回数：ゲームの回数と、棚ごとに比べた組の数（全部の回の合計。練習は入れない）
  const kakunin = { 回: kaiList.length, ...Object.fromEntries(['A', 'B', 'C'].map((k) => [k, kaiList.reduce((s, r) => s + matome(r, k).kakunin, 0)])) };
  const { card, kurikaeshi } = erabuCardKai(kaiList);
  const kotei = { kakunin, sankou: SANKOU, card, kurikaeshi };
  const yobi = (wake) => ({ ...yobiKasetsu(kaiList, tana, atehamaru), ...kotei, dare: 'yobi', wake });

  const wake = yobiWake(env, ip);
  if (wake) return yobi(wake);
  const schema = {
    type: 'object',
    properties: {
      kasetsu: { type: 'string' },
      tsugi: { type: 'string' },
      konkyo: { type: 'array', items: { type: 'string' } },
    },
    required: ['kasetsu', 'tsugi', 'konkyo'],
    additionalProperties: false,
  };
  const yakuwari = [
    '先生の画面に出す「Claude の仮説」の下書きを書きます。読むのは先生ですが、保護者が読んでも傷つかない言葉で書きます。',
    'ゲームの結果・選んだ答え・チェック項目で当てはまったことを並べて読み、次の形で書いてください。',
    '- kasetsu：「〇〇のとき、力が出ているかも。」の形の1文。',
    '- tsugi：「次に試すなら、△△。」の形の1文。授業でできる、具体的な出し方の工夫。',
    '- konkyo：そう考えた理由を、事実だけで2〜5個（数字・選んだ答え・気づきの候補）。性格の名前や行動の評価は書かない。',
    '結果が「差なし」や「まだそろっていない」のときは、そのまま書きます（差が出ないのも、ふつうの結果）。「候補」になっていない差からは、決めつけない。',
    '「回をまたいだ結果」があるときは、それも読みます。比べるのは各回の中の出し方の差どうしで、素点を回ごとに比べない。「くり返し出た候補」があれば、何回のうち何回かを事実で書く。',
    '「確かめた回数」と「参考程度・決めるのは先生」は、画面の側で必ず添えるので、書かなくてよい。',
  ].join('\n');
  const r = await askClaude({
    env,
    yakuwari,
    naiyou: claudeNiOkuru(record, tana, atehamaru, kaiList),
    schema,
    kensa: (o) => {
      const m = [];
      if (!/かも/.test(o.kasetsu || '')) m.push('kasetsu は「〇〇のとき、力が出ているかも。」の形にしてください。');
      if (!/^次に試すなら/.test(o.tsugi || '')) m.push('tsugi は「次に試すなら」で始めてください。');
      return m;
    },
  });
  if (!r.ok) return yobi(`Claude が使えなかったので（${r.wake}）、決まった文の予備の動きで出しています。`);
  return { ...r.obj, ...kotei, dare: 'claude', tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

async function tsutae(body, env, ip) {
  const kaiList = seiriKai(body);
  const record = kaiList[kaiList.length - 1];
  const cards = data('cards');
  const { card: cardId, kurikaeshi } = erabuCardKai(kaiList);
  const yobi = (wake) => ({ ...yobiTsutae(kaiList, cards), dare: 'yobi', wake, sankou: SANKOU });
  const wake = yobiWake(env, ip);
  if (wake) return yobi(wake);
  const card = cardNoBun(cards.カード[cardId], kurikaeshi);
  const schema = {
    type: 'object',
    properties: { kondan: { type: 'string' }, hogosha: { type: 'string' }, hitokoto: { type: 'string' } },
    required: ['kondan', 'hogosha', 'hitokoto'],
    additionalProperties: false,
  };
  const yakuwari = [
    '伝え方の下書きを3つ書きます。決めるのは先生です。',
    '- kondan：懇談で先生が保護者に口で言うための下書き。4〜6文。事実（試した出し方とその結果）→授業で試す工夫→家庭で気づいたことを聞く、の順。1回のゲームでは決めつけないことを添える。',
    '- hogosha：保護者から求められたときに渡す、スイッチカードの説明。3文くらい。強みだけを書く。',
    '- hitokoto：同じ学年や、ほかの教科の先生に伝える一言。2文くらい。授業で試せる出し方の工夫と、その根拠（ゲームで何回のうち何回か）を事実で書き、「参考程度」と添える。',
    '他の子との比べ、性格の名前、行動の評価、効果をうたう言葉は書かない。回をまたいだ結果は、何回のうち何回かを事実で書く。',
  ].join('\n');
  const r = await askClaude({
    env,
    yakuwari,
    naiyou: {
      スイッチカード: { 名前: card.名前, ひとこと: card.ひとこと, これは何か: card.これは何か },
      結果: claudeNiOkuru(record, data('tana'), [], kaiList),
      根拠: konkyoList(kaiList, data('tana'), atehamaruText(body.atehamaru)),
    },
    schema,
  });
  if (!r.ok) return yobi(`Claude が使えなかったので（${r.wake}）、決まった文の予備の動きで出しています。`);
  return { ...r.obj, cardMei: card.名前, dare: 'claude', sankou: SANKOU, tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

export async function handle(name, method, body, env, ip = 'local') {
  try {
    if (name === 'joutai' && method === 'GET') {
      return [200, { ai: Boolean(env.ANTHROPIC_API_KEY), soudan: soudanSaki() }];
    }
    if (method !== 'POST') return [405, { error: 'POST で送ってください' }];
    if (name === 'tsugi') return [200, await tsugi(body, env, ip)];
    if (name === 'kasetsu') return [200, await kasetsu(body, env, ip)];
    if (name === 'tsutae') return [200, await tsutae(body, env, ip)];
    if (name === 'tenken') {
      const text = String(body?.text ?? '').slice(0, 5000);
      return [200, { hits: tenken(text).map((h) => ({ 寄せる言葉: h.寄せる言葉, 位置: h.位置, 長さ: h.言葉.length })) }];
    }
    return [404, { error: '見つかりません' }];
  } catch (e) {
    // 画面に英語のままのエラーを出さない（日本語で書いた理由だけを返す）
    const nihongo = /[\u3040-\u30ff\u4e00-\u9fff]/.test(e?.message || '');
    if (!nihongo) console.error(e);
    return [400, { error: nihongo ? e.message : '送られた記録の形が合いません。' }];
  }
}

// 点検用に外から使う
export { tenkenAll, data, DASHIKATA };
