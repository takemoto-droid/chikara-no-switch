// 学校の設定（06 第3.1版 F5）。はじめの値は data/gakko.json。先生の画面で変えた値は、この端末の中にだけ残す。
import { data } from './util.js';
import { load, save } from './kiroku.js';

export async function gakkoSettei() {
  const g = await data('gakko');
  const kae = load().gakko || {};
  const settei = { ...g.設定 };
  for (const [k, v] of Object.entries(kae)) if (g.選べるもの[k]?.includes(v)) settei[k] = v;
  return settei;
}

export async function gakkoWoKaeru(k, v) {
  const g = await data('gakko');
  if (!g.選べるもの[k]?.includes(v)) return false;
  const st = load();
  st.gakko = { ...(st.gakko || {}), [k]: v };
  save(st);
  return true;
}

// 相談先の文に、学校の設定の呼び名を入れる（2026-11-05 先生の決定。学校の中では全員に同じ文）
export function soudanNoBun(hinagata, settei) {
  return String(hinagata || '').replaceAll('{相談先}', settei?.相談先の呼び名 || 'カウンセラーの先生');
}

// 計画・Claude の文の目印に使う設定（相談先の呼び名は入れない。呼び名を変えても、Claude を呼び直さない・送らない）
export function keikakuNoSettei(settei) {
  const { 相談先の呼び名: _, ...hoka } = settei || {};
  return hoka;
}

