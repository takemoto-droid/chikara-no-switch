// Claude を呼ぶ所。API キーはサーバー側だけで読む。
// 出てきた文は言葉の正本で点検し、避ける言葉があれば書き直しを頼む。だめなら null を返し、予備の動きに切り替える。
import Anthropic from '@anthropic-ai/sdk';
import { tenkenAll, kimariForClaude } from './kotoba.mjs';

const MODEL_DEFAULT = 'claude-opus-5-5';
const KAKINAOSHI = 2; // 書き直しを頼む回数

export function systemPrompt(yakuwari) {
  return [
    'あなたは、中学校の授業で使うウェブアプリ「チカラのスイッチ」の中で、先生を手伝う Claude です。',
    'このアプリは、同じ難しさの問題を出し方（読む・聞く・図を添える・区切る など）だけ変えて解き、その子の中で、どの出し方のとき力が出たかを確かめます。他の子とは比べません。学び方の型を決めません。医療の判断もしません。',
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

// client は確かめ（scripts/kurabe-test.mjs）のときだけ外から渡す
export async function askClaude({ env, yakuwari, naiyou, schema, kensa, client: kakunin }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey && !kakunin) return { ok: false, wake: 'キー無し' };
  const client = kakunin || new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const model = env.CLAUDE_MODEL || MODEL_DEFAULT;
  const system = systemPrompt(yakuwari);
  let user = JSON.stringify(naiyou, null, 2);
  let kaisu = 0;
  const kiroku = [];
  for (let i = 0; i <= KAKINAOSHI; i++) {
    kaisu++;
    let res;
    try {
      res = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: user }],
      });
    } catch (e) {
      return { ok: false, wake: `呼び出しの失敗（${e?.status ?? e?.name ?? 'エラー'}）`, kaisu };
    }
    if (res.stop_reason === 'refusal') return { ok: false, wake: '断られた', kaisu };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let obj;
    try {
      obj = JSON.parse(text);
    } catch {
      return { ok: false, wake: '形が合わない', kaisu };
    }
    const hits = tenkenAll(obj);
    const mondai = kensa ? kensa(obj) : [];
    kiroku.push({ kai: kaisu, mitsukatta: hits.length + mondai.length });
    if (hits.length === 0 && mondai.length === 0) {
      return { ok: true, obj, kaisu, kiroku, model: res.model };
    }
    const shiteki = [
      ...hits.map((h) => `「${h.言葉}」が入っていました（寄せる言葉：${h.寄せる言葉}）。`),
      ...mondai,
    ].join('\n');
    user = `${JSON.stringify(naiyou, null, 2)}\n\n## 前の下書き\n${text}\n\n## 書き直してください\n${shiteki}\n同じ形の JSON で、全体を書き直してください。`;
  }
  return { ok: false, wake: '書き直しても避ける言葉が残った', kaisu, kiroku };
}
