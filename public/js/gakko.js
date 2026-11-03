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
