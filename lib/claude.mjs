// Claude を呼ぶ所。API キーはサーバー側だけで読む。
// 出てきた文は言葉の正本で点検し、避ける言葉があれば書き直しを頼む。だめなら null を返し、予備の動きに切り替える。
import Anthropic from '@anthropic-ai/sdk';
import { tenkenAll, kimariForClaude } from './kotoba.mjs';

const MODEL_DEFAULT = 'claude-opus-5-5';
const KAKINAOSHI = 2; // 書き直しを頼む回数

export function systemPrompt(yakuwari) {
  return [
    'あなたは、中学校の授業で使うウェブアプリ「チカラのスイッチ」の中で、先生を手伝う Claude です。',
    'このアプリは、同じ難しさの問題を出し方（読む・聞く・文で見る／図で見る・一気に／区切って など）だけ変えて解き、その子の中で、どの出し方のとき力が出たかを確かめます。他の子とは比べません。学び方の型を決めません。医療の判断もしません。',
    '決めるのは先生です。あなたの文は、先生に出す下書きです。',
    '',
    `## この呼び出しでの役目\n${yakuwari}`,
    '',
    kimariForClaude(),
    '',
    '## 出力',
    '指定された JSON の形だけで答えてください。文はすべて日本語で、中学生や保護者が読んでも分かる、やさしい言葉で書いてください。',
  ].join('\n');
}

// 試験的な機能（server-side-fallback の beta・fallbacks）で呼んで失敗したら、
// それを外したふつうの呼び方で1回だけ呼び直す。それでもだめなら null（予備の動きへ）。
// 確かめた文書：
//   https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
//   https://platform.claude.com/docs/en/build-with-claude/structured-outputs
//   https://platform.claude.com/docs/en/build-with-claude/effort
const SHIKEN_BETA = 'server-side-fallback-2026-07-01';
const YOBINAOSU_STATUS = new Set([400, 404, 422]);

function jsonWoNuku(text) {
  try { return JSON.parse(text); } catch { /* 下で前後の文を外して試す */ }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

// 返ってきた JSON が、決めた形（schema）に合っているか
export function katachiOK(obj, schema) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  for (const k of schema.required || []) {
    const def = schema.properties[k];
    const v = obj[k];
    if (v === undefined) return false;
    if (def.type === 'string' && typeof v !== 'string') return false;
    if (def.type === 'array' && !(Array.isArray(v) && v.every((x) => typeof x === 'string'))) return false;
    if (def.enum && !def.enum.includes(v)) return false;
  }
  return true;
}

async function yobu(client, { model, system, user, schema, futsuu }) {
  if (!futsuu) {
    return client.beta.messages.create({
      model,
      max_tokens: 4000,
      betas: [SHIKEN_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
  }
  // ふつうの呼び方：試験的な機能も出力の形の指定も使わず、形は文で頼む
  return client.messages.create({
    model,
    max_tokens: 4000,
    system: `${system}\n\n## JSON の形\n次の JSON Schema に合う JSON だけを出してください。前後に文を付けないでください。\n${JSON.stringify(schema)}`,
    messages: [{ role: 'user', content: user }],
  });
}

// 偽の Claude は、確かめ（scripts/kurabe-test.mjs）のときだけ外から渡す
let niseClient = null;
export function niseNoClaude(c) {
  niseClient = c;
}

export async function askClaude({ env, yakuwari, naiyou, schema, kensa, client }) {
  const kakunin = client || niseClient;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey && !kakunin) return { ok: false, wake: 'キー無し' };
  const cl = kakunin || new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const model = env.CLAUDE_MODEL || MODEL_DEFAULT;
  const system = systemPrompt(yakuwari);
  let user = JSON.stringify(naiyou, null, 2);
  let kaisu = 0;
  let futsuu = env.CLAUDE_FUTSUU === '1'; // 最初からふつうの呼び方にしたいとき
  let yobinaoshita = false;
  const kiroku = [];
  // 試験的な呼び方で失敗したら、ふつうの呼び方に切りかえて同じ回をやり直す（1回だけ）
  const shippai = (wake) => {
    if (!futsuu && !yobinaoshita) {
      futsuu = true;
      yobinaoshita = true;
      kiroku.push({ kai: kaisu, yobinaoshi: wake });
      return true;
    }
    return false;
  };
  for (let i = 0; i <= KAKINAOSHI; i++) {
    kaisu++;
    let res;
    try {
      res = await yobu(cl, { model, system, user, schema, futsuu });
    } catch (e) {
      const status = e?.status;
      if (YOBINAOSU_STATUS.has(status) && shippai(`試験的な呼び方で ${status}`)) { i--; continue; }
      return { ok: false, wake: `呼び出しの失敗（${status ?? e?.name ?? 'エラー'}）`, kaisu, kiroku };
    }
    if (res.stop_reason === 'refusal') return { ok: false, wake: '断られた', kaisu, kiroku };
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const obj = jsonWoNuku(text);
    if (!katachiOK(obj, schema)) {
      if (shippai('形が合わない')) { i--; continue; }
      return { ok: false, wake: '形が合わない', kaisu, kiroku };
    }
    const hits = tenkenAll(obj);
    const mondai = kensa ? kensa(obj) : [];
    kiroku.push({ kai: kaisu, mitsukatta: hits.length + mondai.length });
    if (hits.length === 0 && mondai.length === 0) {
      return { ok: true, obj, kaisu, kiroku, model: res.model, yobikata: futsuu ? 'futsuu' : 'shiken' };
    }
    const shiteki = [
      ...hits.map((h) => `「${h.言葉}」が入っていました（寄せる言葉：${h.寄せる言葉}）。`),
      ...mondai,
    ].join('\n');
    user = `${JSON.stringify(naiyou, null, 2)}\n\n## 前の下書き\n${text}\n\n## 書き直してください\n${shiteki}\n同じ形の JSON で、全体を書き直してください。`;
  }
  return { ok: false, wake: '書き直しても避ける言葉が残った', kaisu, kiroku };
}
