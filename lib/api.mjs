// サーバー側の関数の中身。手元のサーバー（server.mjs）と Vercel（api/[name].js）の両方から呼ぶ。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, tenken, tenkenAll, soudanSaki, soudanSakiKo, soudanSakiOtona } from './kotoba.mjs';
import { askClaude } from './claude.mjs';
import { yobiKeikaku, shitaKoto } from '../public/js/keikaku.js';
import { SODATE_MODES, SODATE_MEI, DAN_NO_DASHIKATA, DAN_JOUGEN, kyouNoRiyuuWoKaku } from '../public/js/sodateru.js';
import { yobiKasetsu, yobiTsutae, konkyoList, SANKOU, yobiNextLabel, HR_NO_HANASHI } from './yobi.mjs';
import { kouho, yobiNext, yobiRiyuu, stepOf, matome, erabuCardKai, cardNoBun, claudeNiOkuru, KUMI, DASHIKATA, mieruKoumoku, namaeWoAwaseru } from '../public/js/kurabe.js';

const dataCache = {};
function data(name) {
  const yomu = (n) => JSON.parse(readFileSync(path.join(ROOT, 'public', 'data', `${n}.json`), 'utf8'));
  // カードの名前・副題・レベルの名前は card_namae.json から重ねる（7便）
  if (!dataCache[name]) dataCache[name] = name === 'cards' ? namaeWoAwaseru(yomu('cards'), yomu('card_namae')) : yomu(name);
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
    if (!/^(A-r[12]|[ABC]-[1-8]|D[1-8])$/.test(k)) continue;
    kekka[k] = {
      seikai: Number.isFinite(v?.seikai) ? v.seikai : undefined,
      kazu: Number.isFinite(v?.kazu) ? v.kazu : undefined,
      ms: Number.isFinite(v?.ms) ? v.ms : undefined,
      mikaeshi: Number.isFinite(v?.mikaeshi) ? v.mikaeshi : undefined,
      yomiageNashi: v?.yomiageNashi ? true : undefined,
      kotae: typeof v?.kotae === 'string' ? v.kotae.slice(0, 40) : undefined,
    };
  }
  // 段階（7便）：はじめの段階と切りかえだけを受け取る
  let dankai;
  if (record.dankai && typeof record.dankai === 'object') {
    dankai = {};
    for (const kind of ['A', 'B', 'C']) {
      const d = record.dankai[kind];
      if (!d) continue;
      dankai[kind] = { dankai: d.dankai === 1 ? 1 : 2, mita: !!d.mita, kirikae: d.kirikae && [1, 2].includes(d.kirikae.to) ? { to: d.kirikae.to } : undefined };
    }
  }
  return { junban, kekka, dankai, shurui: record.shurui === 'mijikai' ? 'mijikai' : 'hr', doreNashi: record.doreNashi === true ? true : undefined, hi: typeof record.hi === 'string' ? record.hi.slice(0, 10) : undefined, kai: Number.isInteger(record.kai) ? record.kai : undefined };
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
    'ゲームは HR の1回のこと。読む／聞くなどの比べ（棚）をゲームと呼ばない。数を書くときは、ゲームの回数と、比べた組の数を分けて書く。',
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
    properties: { kondan: { type: 'string' }, hogosha: { type: 'string' }, hitokoto: { type: 'string' }, hr: { type: 'string' } },
    required: ['kondan', 'hogosha', 'hitokoto', 'hr'],
    additionalProperties: false,
  };
  const yakuwari = [
    '伝え方の下書きを4つ書きます。決めるのは先生です。',
    '- kondan：懇談で先生が保護者に口で言うための下書き。4〜6文。事実（試した出し方とその結果）→授業で試す工夫→家庭で気づいたことを聞く、の順。1回のゲームでは決めつけないことを添える。',
    '- hogosha：保護者から求められたときに渡す、スイッチカードの説明。3文くらい。強みだけを書く。',
    '- hitokoto：同じ学年や、ほかの教科の先生に伝える一言。2文くらい。授業で試せる出し方の工夫と、その根拠（ゲームで何回のうち何回か）を事実で書き、「参考程度」と添える。',
    '- hr：HR の冒頭で、先生がクラス全体に口で話すことの下書き。5〜7文。この子の結果は書かない（全員に同じ話）。テストではないこと、ほかの人と比べないこと、全員にカードが届くこと、答えたくない質問は「今は答えない」を選べること、困ったことはいつでも先生に話せることを入れる。かかる時間は言い切らない。',
    '他の子との比べ、性格の名前、行動の評価、効果をうたう言葉は書かない。回をまたいだ結果は、何回のうち何回かを事実で書く。',
  ].join('\n');
  const r = await askClaude({
    env,
    yakuwari,
    naiyou: {
      HRの冒頭の話の例: HR_NO_HANASHI,
      スイッチカード: { 名前: card.名前, ひとこと: card.ひとこと, これは何か: card.これは何か },
      結果: claudeNiOkuru(record, data('tana'), [], kaiList),
      根拠: konkyoList(kaiList, data('tana'), atehamaruText(body.atehamaru)),
    },
    schema,
  });
  if (!r.ok) return yobi(`Claude が使えなかったので（${r.wake}）、決まった文の予備の動きで出しています。`);
  return { ...r.obj, cardMei: card.名前, dare: 'claude', sankou: SANKOU, tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

// 練習問題を Claude が作る（Should・5便）。練習は比べる数に入れないので、ここだけ流動にしてよい（測る問題は固定）。
// キーが無いとき・作れなかったときは null を返し、画面は決まった練習問題（A0a・A0b）を使う。
async function renshu(body, env, ip) {
  const wake = yobiWake(env, ip);
  if (wake) return { dare: 'yobi', mondai: null, wake };
  const SHURUI = ['本文どおり', '言い換え', '一語変え', '無関係'];
  const schema = {
    type: 'object',
    properties: {
      honbun: { type: 'array', items: { type: 'string' } },
      toi: { type: 'array', items: { type: 'object', properties: { bun: { type: 'string' }, kotae: { type: 'boolean' }, shurui: { type: 'string', enum: SHURUI } }, required: ['bun', 'kotae', 'shurui'], additionalProperties: false } },
    },
    required: ['honbun', 'toi'],
    additionalProperties: false,
  };
  const yakuwari = [
    'ゲームの「練習」に使う、短い文章と問いを1つ作ります。中学生が読んで答えます。練習なので、比べる数には入れません。',
    '- honbun：日常や学校の、だれも傷つかない話題の文章。4文。1文は20〜30字。全体で90〜115字。漢字はおよそ3割。',
    '- toi：本文と合っているかを答える文を4つ。種類は「本文どおり」「言い換え」「一語変え」（一語だけ変えて意味が変わる）「無関係」（本文に無いが似ている）を1つずつ。kotae は、本文どおり・言い換えが true、一語変え・無関係が false。',
    '実在の人・学校・商品の名前、病気やけが、こわい話、人をからかう話は使わない。市販の教材や試験の文を使わない。',
  ].join('\n');
  const r = await askClaude({
    env,
    yakuwari,
    naiyou: { 出し方: body?.mode === 'kiku' ? '聞く（読み上げる）' : '読む', 何個目の練習か: body?.n === 2 ? 2 : 1 },
    schema,
    kensa: (o) => {
      const m = [];
      const zen = (o.honbun || []).join('');
      if ((o.honbun || []).length !== 4) m.push('honbun は4文にしてください。');
      if (zen.length < 90 || zen.length > 115) m.push('honbun は全体で90〜115字にしてください。');
      if ((o.toi || []).length !== 4 || SHURUI.some((k) => (o.toi || []).filter((t) => t.shurui === k).length !== 1)) m.push('toi は4つで、種類を1つずつにしてください。');
      if ((o.toi || []).some((t) => t.kotae !== (t.shurui === '本文どおり' || t.shurui === '言い換え'))) m.push('kotae は、本文どおり・言い換えが true、一語変え・無関係が false です。');
      return m;
    },
  });
  if (!r.ok) return { dare: 'yobi', mondai: null, wake: `Claude が使えなかったので（${r.wake}）、決まった練習問題を使います。` };
  return {
    dare: 'claude',
    mondai: { 本文: r.obj.honbun, 問い: r.obj.toi.map((t) => ({ 文: t.bun, 答え: t.kotae, 種類: t.shurui })), 作った: 'Claude' },
    tenken: { kaisu: r.kaisu, yobikata: r.yobikata },
  };
}

// ⑥ 育てる：今日の練習の出し方を、候補の中から選び、理由を書く（段は練習の中の事実だけで決まるので、Claude は変えない）
function yobiSodate(kouho, jokyou) {
  const c = [...kouho].sort((x, y) => (jokyou[x]?.hi ?? 0) - (jokyou[y]?.hi ?? 0));
  const m = c[0];
  const j = jokyou[m] || { dan: 1, hi: 0, tsuzuki: 0, kyouAri: false };
  return { mode: m, riyuu: kyouNoRiyuuWoKaku(j.hi, j.tsuzuki, j.dan, j.kyouAri) };
}

async function sodate(body, env, ip) {
  const kouho = (Array.isArray(body?.kouho) ? body.kouho : []).filter((m) => SODATE_MODES.includes(m)).slice(0, 5);
  if (!kouho.length) throw new Error('育てる出し方がありません');
  const jokyou = {};
  for (const j of Array.isArray(body?.jokyou) ? body.jokyou : []) {
    if (!kouho.includes(j?.mode)) continue;
    const dan = Number.isInteger(j.dan) && j.dan >= 1 && j.dan <= DAN_JOUGEN ? j.dan : 1;
    jokyou[j.mode] = { dan, hi: Number.isInteger(j.hi) && j.hi >= 0 ? Math.min(j.hi, 400) : 0, tsuzuki: j.tsuzuki === 1 ? 1 : 0, kyouAri: j.kyouAri === true };
  }
  const yobi = (wake) => ({ ...yobiSodate(kouho, jokyou), dare: 'yobi', wake });
  if (kouho.length === 1) {
    const r = yobiSodate(kouho, jokyou);
    return { ...r, dare: 'kimari' };
  }
  const wake = yobiWake(env, ip);
  if (wake) return yobi(wake);
  const schema = {
    type: 'object',
    properties: { mode: { type: 'string', enum: kouho }, riyuu: { type: 'string' } },
    required: ['mode', 'riyuu'],
    additionalProperties: false,
  };
  const yakuwari = [
    '朝の練習で、今日育てる出し方を「候補」の中から1つ選び、その理由を書きます。',
    '理由は、練習をする中学生本人の画面にそのまま出ます。1文、20字くらいまで、やさしい言葉で書いてください（例：「はじめての 練習。」「前回は 正解が多かった。もう一回。」）。',
    '段（どこまで支えを減らすか）は、練習の中の事実だけで決まっています。段を変えると書かないでください。本人の画面では「段」と言わず「やり方」と言います。',
    '「苦手」という言葉、ほめる・評価する言葉、他の人との比べは書かないでください。',
    '選ぶときの考え方：練習した日が少ない出し方を先に。同じ出し方ばかりが続かないようにする。',
  ].join('\n');
  const naiyou = { 候補: kouho.map((m) => ({ mode: m, 出し方: SODATE_MEI[m], いまの段: DAN_NO_DASHIKATA[m][(jokyou[m]?.dan ?? 1) - 1], 練習した日: jokyou[m]?.hi ?? 0 })) };
  const r = await askClaude({
    env,
    yakuwari,
    naiyou,
    schema,
    kensa: (o) => {
      const m = [];
      if (!kouho.includes(o.mode)) m.push('mode は候補の中から選んでください。');
      if ((o.riyuu || '').length > 30) m.push('理由を20字くらいまでにしてください。');
      if (/苦手|すごい|よくでき|段/.test(o.riyuu || '')) m.push('理由に「苦手」・ほめ言葉・「段」「段階」を書かないでください。');
      return m;
    },
  });
  if (!r.ok) return yobi(`Claude が使えなかったので（${r.wake}）、決まった順の予備の動きで選んでいます。`);
  return { mode: r.obj.mode, riyuu: r.obj.riyuu, dare: 'claude', tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

// ④(f) 期間の計画：学校の設定とクラスの結果から（名前は受け取らない。「子1」などの仮の番号だけ）
function seiriKeikaku(body) {
  const g = data('gakko');
  const settei = { ...g.設定 };
  for (const k of Object.keys(g.選べるもの)) if (g.選べるもの[k].includes(body?.settei?.[k])) settei[k] = body.settei[k];
  const CARDS = ['kiku', 'yomu', 'zu', 'kugiru'];
  const kodomo = (Array.isArray(body?.kodomo) ? body.kodomo : []).slice(0, 60).filter((k) => /^子\d{1,3}$/.test(k?.label)).map((k) => ({
    label: k.label,
    kaisu: Number.isInteger(k.kaisu) ? Math.min(Math.max(k.kaisu, 0), 50) : 0,
    // 10便 M1：回の種類（② HR のゲーム／⑦ また見つける）と回数。無いとき（前の形）は、全部を HR のゲームとみなす
    gameKaisu: Number.isInteger(k.gameKaisu) ? Math.min(Math.max(k.gameKaisu, 0), 50) : (Number.isInteger(k.kaisu) ? Math.min(Math.max(k.kaisu, 0), 50) : 0),
    mataKaisu: Number.isInteger(k.mataKaisu) ? Math.min(Math.max(k.mataKaisu, 0), 50) : 0,
    mitsuketa: (Array.isArray(k.mitsuketa) ? k.mitsuketa : []).filter((c) => CARDS.includes(c?.card)).map((c) => ({ card: c.card, level: [1, 2, 3].includes(c.level) ? c.level : 1 })),
    sodate: (Array.isArray(k.sodate) ? k.sodate : []).filter((x) => SODATE_MODES.includes(x?.mode)).map((x) => ({ mode: x.mode, dan: [1, 2, 3, 4].includes(x.dan) ? x.dan : 1, hi: Number.isInteger(x.hi) ? Math.min(Math.max(x.hi, 0), 400) : 0, ichininmae: x.ichininmae === true || x.dan === 4 })),
    jibun: Boolean(k.jibun),
  }));
  if (!kodomo.length) throw new Error('計画に使う子の記録がありません');
  return { settei, kodomo };
}

// 計画に渡す材料（10便 M1）。名前は無く、仮の番号・したこと（回の種類と回数）・カード・育てる出し方（段・練習した日・一人前か）・設定だけ
export function keikakuNoZairyou(settei, kodomo) {
  const CARD_MEI = { kiku: '聞く', yomu: '読む', zu: '図で見る', kugiru: '区切って読む' };
  const LV = data('cards').レベル.見つけた; // レベルの名前は card_namae.json から
  return {
    学校の設定: settei,
    練習の日の目安: yobiKeikaku(settei, []).zentai,
    子ども: kodomo.map((k) => ({
      label: k.label,
      したこと: shitaKoto(k),
      見つけたカード: k.mitsuketa.map((c) => `${CARD_MEI[c.card]}で力が出た（レベル：${LV[c.level - 1]}）`),
      育てる出し方: k.sodate.map((x) => ({ 出し方: SODATE_MEI[x.mode], いまの段: `段${x.dan}「${DAN_NO_DASHIKATA[x.mode][x.dan - 1]}」`, 練習した日: x.hi, 一人前: x.ichininmae ? 'はい（練習は終わっている）' : 'いいえ', 本人が選んだ: k.jibun ? 'はい（本人の好み）' : 'いいえ' })),
    })),
  };
}

// 計画の文で、取り違えを見つける（書き直させる）
export function keikakuNoMondai(o, kodomo) {
  const m = [];
  for (const x of o.ko || []) {
    const k = kodomo.find((y) => y.label === x.label);
    if (!k) continue;
    const bun = String(x.bun || '');
    if (!k.mataKaisu && /また見つける」?(の(ゲーム|回))?で[^。]*(見つかりました|見つかった|出ました|出た)/.test(bun)) m.push(`${k.label} は ⑦ また見つけるをまだしていません。見つかったのは ② 見つける（HR のゲーム）です。`);
    const owari = k.sodate.filter((y) => y.ichininmae);
    const subete = owari.length && owari.length === k.sodate.length; // 育てる出し方がすべて一人前（続ける練習が無い）
    for (const s of owari) {
      const naka = (b) => b.includes(SODATE_MEI[s.mode]) || b.includes(DAN_NO_DASHIKATA[s.mode][3]);
      const tsuzukeru = (b) => /続け|日ほど練習|練習する案/.test(b);
      const dame = subete
        ? tsuzukeru(bun) // 文の区切りに関係なく
        : bun.split('。').some((b) => naka(b) && tsuzukeru(b) && !/一人前/.test(b));
      if (dame) m.push(`${k.label} の「${SODATE_MEI[s.mode]}」は一人前で、練習は終わっています。続けると書かず、「一人前。次に育てる出し方は先生が決める」の形で書いてください。`);
    }
  }
  return m;
}

async function keikaku(body, env, ip) {
  const { settei, kodomo } = seiriKeikaku(body);
  const yobi = (wake) => ({ ...yobiKeikaku(settei, kodomo), dare: 'yobi', wake, sankou: SANKOU });
  const wake = yobiWake(env, ip);
  if (wake) return yobi(wake);
  const labels = kodomo.map((k) => k.label);
  const schema = {
    type: 'object',
    properties: {
      zentai: { type: 'string' },
      ko: { type: 'array', items: { type: 'object', properties: { label: { type: 'string', enum: labels }, bun: { type: 'string' } }, required: ['label', 'bun'], additionalProperties: false } },
    },
    required: ['zentai', 'ko'],
    additionalProperties: false,
  };
  const yakuwari = [
    '先生の画面に出す「期間の計画」の下書きを書きます。次の「また見つける」までの期間に、誰に・どの出し方を・どの段から・何日ほど朝の練習をするかの案です。',
    '- zentai：学校の設定にもとづく、計画全体の説明（2〜3文）。',
    '- ko：子ごとに1つ（label はそのまま）。bun は1〜2文。育てる出し方・いまの段・頻度と日数を、事実と設定から書く。',
    '段は練習の中の事実だけで進むので、「何日で段が進む」「レベルが上がる」と予想しないでください。効果（成績・学力・集中力など）もうたわないでください。',
    '出し方の差がまだ見つかっていない子は、本人が選んだ出し方で練習するか、次の「また見つける」で確かめる、と書きます。「苦手」と書かないでください（避ける言葉は、別に渡す言葉の正本で点検します）。',
    '「② 見つける」は HR のゲーム、「⑦ また見つける」は間隔をあけてする短いゲームで、別のものです。子ごとの「したこと」に書かれた種類と回数のとおりに書いてください。⑦ をまだしていない子（また見つける 0回）について、「また見つけるで見つかった」「〇回のまた見つけるで」と書かないでください。カードや候補が見つかったのは、その子の「したこと」に書かれたゲームです。',
    '育てる出し方に「一人前：はい」とあるものは、段4（上限）まで来ていて、その出し方の練習は終わっています。その出し方を「続ける」「〇日練習する」と書かず、「一人前。次に育てる出し方は先生が決める」の形で書いてください。一人前でない育てる出し方があれば、その練習の案を書きます。',
    '参考程度・決めるのは先生、は画面の側で添えるので書かなくてよい。',
  ].join('\n');
  const naiyou = keikakuNoZairyou(settei, kodomo);
  const r = await askClaude({
    env,
    yakuwari,
    naiyou,
    schema,
    kensa: (o) => {
      const m = [];
      const got = (o.ko || []).map((x) => x.label);
      if (labels.some((l) => !got.includes(l))) m.push('ko には、すべての子を1つずつ入れてください。');
      if (/苦手/.test(JSON.stringify(o))) m.push('「苦手」と書かないでください。');
      if (/段が進む見込み|上がる見込み|日で段/.test(JSON.stringify(o))) m.push('段が進む日を予想しないでください。');
      m.push(...keikakuNoMondai(o, kodomo));
      return m;
    },
  });
  if (!r.ok) return yobi(`Claude が使えなかったので（${r.wake}）、決まった計画の予備の動きで出しています。`);
  return { zentai: r.obj.zentai, ko: r.obj.ko, dare: 'claude', sankou: SANKOU, tenken: { kaisu: r.kaisu, yobikata: r.yobikata } };
}

export async function handle(name, method, body, env, ip = 'local') {
  try {
    if (name === 'joutai' && method === 'GET') {
      return [200, { ai: Boolean(env.ANTHROPIC_API_KEY), soudan: soudanSaki(), soudanKo: soudanSakiKo(), soudanOtona: soudanSakiOtona() }];
    }
    if (method !== 'POST') return [405, { error: 'POST で送ってください' }];
    if (name === 'tsugi') return [200, await tsugi(body, env, ip)];
    if (name === 'kasetsu') return [200, await kasetsu(body, env, ip)];
    if (name === 'tsutae') return [200, await tsutae(body, env, ip)];
    if (name === 'renshu') return [200, await renshu(body, env, ip)];
    if (name === 'sodate') return [200, await sodate(body, env, ip)];
    if (name === 'keikaku') return [200, await keikaku(body, env, ip)];
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
