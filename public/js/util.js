// 画面づくりの小さな道具
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function api(name, body, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`api/${name}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const dataCache = {};
export async function data(name) {
  if (!dataCache[name]) dataCache[name] = await (await fetch(`data/${name}.json`)).json();
  return dataCache[name];
}

// 記録のうち、サーバーに送る部分だけ（名前・番号は送らない）
export function okuruKiroku(rec) {
  return { junban: rec.junban, kekka: rec.kekka };
}

export function whoLabel(dare) {
  if (dare === 'claude') return '<span class="label ai">Claude（AI）が書いた下書き</span>';
  if (dare === 'kimari') return '<span class="label">決まった文</span>';
  return '<span class="label yobi">予備の動き（決まった文）</span>';
}

export const MICHI = ['① 案内', '② ゲーム', '③ スイッチカード', '④ 先生の画面', '⑤ 伝え方', '⑥ 学習につなぐ'];
