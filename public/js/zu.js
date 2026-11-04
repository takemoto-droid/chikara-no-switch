// 場面の図（テープ図）。計算はさせず、場面だけを見せる。
// z = { ひとつ, ひとつの名前, べつ?, べつの名前?, 文字, 合計? }。wakuDake：数字を消した枠だけ（⑥ 育てるの段2）
export function tapeZu(z, { wakuDake = false } = {}) {
  const en = (n) => (wakuDake ? '　' : `${n}円`);
  const W = 340;
  const H = 120;
  const x0 = 10;
  const hitotsuW = 54;
  const n = 3; // 「何個か」を3つの箱と「…」で表す
  let x = x0;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`<rect x="${x}" y="30" width="${hitotsuW}" height="34" rx="4" fill="#e2eef3" stroke="#2f6f8f" stroke-width="2"/>`);
    parts.push(`<text x="${x + hitotsuW / 2}" y="52" font-size="13" text-anchor="middle" fill="#23262b">${en(z.ひとつ)}</text>`);
    x += hitotsuW;
  }
  parts.push(`<text x="${x + 14}" y="52" font-size="16" text-anchor="middle" fill="#23262b">…</text>`);
  x += 28;
  const tapeEnd = x;
  const aru = z.べつ != null;
  const betsuW = aru ? 76 : 0;
  if (aru) {
    parts.push(`<rect x="${x}" y="30" width="${betsuW}" height="34" rx="4" fill="#f6ead6" stroke="#8a5a2b" stroke-width="2"/>`);
    parts.push(`<text x="${x + betsuW / 2}" y="52" font-size="13" text-anchor="middle" fill="#23262b">${en(z.べつ)}</text>`);
  }
  const end = x + betsuW;
  // 上のかっこ：何個か
  parts.push(`<path d="M${x0} 24 v-8 h${tapeEnd - x0} v8" fill="none" stroke="#2f6f8f" stroke-width="1.5"/>`);
  parts.push(`<text x="${(x0 + tapeEnd) / 2}" y="12" font-size="12" text-anchor="middle" fill="#2f6f8f">${z.ひとつの名前} ${z.文字} ${z.単位 || '個'}分</text>`);
  if (aru) parts.push(`<text x="${x + betsuW / 2}" y="22" font-size="12" text-anchor="middle" fill="#8a5a2b">${z.べつの名前}</text>`);
  // 下のかっこ：代金
  parts.push(`<path d="M${x0} 72 v8 h${end - x0} v-8" fill="none" stroke="#23262b" stroke-width="1.5"/>`);
  parts.push(`<text x="${(x0 + end) / 2}" y="100" font-size="13" text-anchor="middle" fill="#23262b">代金${z.合計 && !wakuDake ? `（${z.合計}円）` : ''}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="場面の図：${z.ひとつ}円の${z.ひとつの名前}がいくつか${aru ? `と、${z.べつ}円の${z.べつの名前}` : ''}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

// ---- 12便 P3：生活の場面の図（座席・校舎の案内図・ろうか・時間割・棚）。自作。
// 文だけの版と同じ内容を、図だけで読めるように描く。抽象図形・見本との照合・探す形は使わない。
// wakuDake：名前を消した枠だけ（⑥ 育てるの「文」の段2）
const SVG_ESC = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function svg(W, H, label, parts) {
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${SVG_ESC(label)}" xmlns="http://www.w3.org/2000/svg" class="bamen-zu">${parts.join('')}</svg>`;
}
function hako(x, y, w, h, text, { kara = false, waku = false, iro = '#e2eef3', sen = '#2f6f8f', size = 13 } = {}) {
  const dash = kara ? ' stroke-dasharray="5 4"' : '';
  const t = waku ? '' : kara ? '空き' : text;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${kara ? '#ffffff' : iro}" stroke="${kara ? '#9aa0a6' : sen}" stroke-width="2"${dash}/>`
    + (t ? `<text x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="${size}" text-anchor="middle" fill="${kara ? '#5d636b' : '#23262b'}">${SVG_ESC(t)}</text>` : '');
}

export function bamenZu(z, { wakuDake = false } = {}) {
  if (z.type === 'seki') return sekiZu(z, wakuDake);
  if (z.type === 'chizu') return chizuZu(z, wakuDake);
  if (z.type === 'rouka') return roukaZu(z, wakuDake);
  if (z.type === 'jikanwari') return jikanwariZu(z, wakuDake);
  if (z.type === 'tana') return tanaZu(z, wakuDake);
  if (z.type === 'hyou') return hyouZu(z, wakuDake);
  return '';
}

// 座席：上が前（黒板・運転席）。行は前から、列は左から。
// 13便のもと：向きや「前・左」の基準を推測しなくてよいように、図にも「前から 〇列め」「← 左　右 →」を書く（文の版と同じ言い方）
function sekiZu(z, waku) {
  const W = 340;
  const L = 44; // 左の「〇列め」の欄
  const C = Math.max(...z.retsu.map((r) => r.length));
  const cw = Math.min(70, (W - L - 10 - (C - 1) * 6) / C);
  const ch = 36;
  const haba = C * cw + (C - 1) * 6;
  const x0 = L + (W - L - haba) / 2;
  const parts = [`<rect x="${x0}" y="6" width="${haba}" height="24" rx="4" fill="#3d5a4c"/><text x="${x0 + haba / 2}" y="23" font-size="13" text-anchor="middle" fill="#ffffff">${SVG_ESC(z.mae || '黒板')}（前）</text>`,
    `<text x="${x0}" y="46" font-size="11" fill="#5d636b">← 左</text><text x="${x0 + haba}" y="46" font-size="11" text-anchor="end" fill="#5d636b">右 →</text>`,
    `<text x="4" y="46" font-size="11" fill="#5d636b">前から</text>`];
  z.retsu.forEach((r, i) => {
    const y = 52 + i * (ch + 8);
    parts.push(`<text x="4" y="${y + ch / 2 + 4}" font-size="12" fill="#23262b">${i + 1}列め</text>`);
    r.forEach((n, j) => parts.push(hako(x0 + j * (cw + 6), y, cw, ch, n, { kara: n == null, waku })));
  });
  const H = 52 + z.retsu.length * (ch + 8) + 2;
  return svg(W, H, `${z.mae || '黒板'}が前の、席の図（前から 何列め・左から 何番め）`, parts);
}

// 校舎の案内図：階ごとに、まん中に階段。左と右に、階段に近い順に部屋
function chizuZu(z, waku) {
  const W = 340;
  const rw = 66;
  const kw = 48;
  const fh = 50;
  const cx = W / 2;
  const parts = [];
  z.kai.forEach((f, i) => {
    const y = 8 + i * (fh + 22);
    parts.push(`<text x="6" y="${y + 12}" font-size="12" fill="#5d636b">${SVG_ESC(f.mei)}</text>`);
    parts.push(hako(cx - kw / 2, y + 16, kw, fh - 16, '階段', { iro: '#f6ead6', sen: '#8a5a2b', size: 12 }));
    (f.hidari || []).forEach((n, k) => parts.push(hako(cx - kw / 2 - (k + 1) * (rw + 4), y + 16, rw, fh - 16, n, { waku, size: 12 })));
    (f.migi || []).forEach((n, k) => parts.push(hako(cx + kw / 2 + 4 + k * (rw + 4), y + 16, rw, fh - 16, n, { waku, size: 12 })));
  });
  const H = 8 + z.kai.length * (fh + 22);
  return svg(W, H, '校舎の案内図（まん中に階段）', parts);
}

// ろうか：下が入口。左と右に、入口に近い順に部屋。つきあたり（おく）に1つ
function roukaZu(z, waku) {
  const W = 340;
  const n = Math.max((z.hidari || []).length, (z.migi || []).length, 1);
  const rh = 40;
  const top = 44;
  const H = top + n * (rh + 8) + 40;
  const cx = W / 2;
  const parts = [];
  parts.push(`<rect x="${cx - 30}" y="${top - 2}" width="60" height="${n * (rh + 8) + 8}" fill="#f2efe6" stroke="#cfcab9"/>`);
  if (z.oku) parts.push(hako(cx - 60, 4, 120, 34, z.oku, { waku }));
  const s = (arr, migi) => [...(arr || [])].forEach((m, k) => {
    const y = top + (n - 1 - k) * (rh + 8); // 入口（下）に近いほど下
    parts.push(hako(migi ? cx + 36 : cx - 36 - 110, y, 110, rh, m, { waku }));
  });
  s(z.hidari, false);
  s(z.migi, true);
  parts.push(`<text x="${cx}" y="${H - 8}" font-size="13" text-anchor="middle" fill="#23262b">▲ 入口</text>`);
  return svg(W, H, '入口から進む、ろうかの図', parts);
}

// 時間割：時間・教科・場所（・持ち物）。場所が教室でないときは色を変える
function jikanwariZu(z, waku) {
  const W = 340;
  const cols = z.motsu ? ['時間', '教科', '場所', '持ち物'] : ['時間', '教科', '場所'];
  const cw = z.motsu ? [54, 80, 96, 96] : [64, 120, 140];
  const rh = 30;
  const parts = [`<text x="6" y="16" font-size="13" fill="#23262b">${SVG_ESC(z.youbi || '')}</text>`];
  let x = 6;
  cols.forEach((c, k) => { parts.push(hako(x, 24, cw[k], rh, c, { iro: '#ebe8df', sen: '#9aa0a6', size: 12 })); x += cw[k] + 2; });
  z.jikan.forEach((r, i) => {
    let xx = 6;
    const y = 24 + (i + 1) * (rh + 2);
    const soto = r[2] !== '教室';
    const cells = [`${i + 1}時間目`, r[1], r[2], ...(z.motsu ? [r[3] || '—'] : [])];
    cells.forEach((t, k) => {
      parts.push(hako(xx, y, cw[k], rh, t, { waku: waku && k > 0, iro: soto && k >= 2 ? '#f6ead6' : '#ffffff', sen: '#9aa0a6', size: 12 }));
      xx += cw[k] + 2;
    });
  });
  const H = 24 + (z.jikan.length + 1) * (rh + 2) + 6;
  return svg(W, H, `${z.youbi || ''}の時間割の表`, parts);
}

// 棚：上から順に、左から順に物。空きは点線。
// 13便のもと：図にも「上から 〇つめ」「← 左　右 →」を書く（文の版と同じ言い方）
function tanaZu(z, waku) {
  const W = 340;
  const L = 44;
  const C = Math.max(...z.tana.map((r) => r.length));
  const cw = Math.min(70, (W - L - 14 - (C - 1) * 6) / C);
  const ch = 36;
  const haba = C * cw + (C - 1) * 6;
  const x0 = L + (W - L - haba) / 2;
  const parts = [`<text x="${x0 + haba / 2}" y="14" font-size="13" text-anchor="middle" fill="#23262b">${SVG_ESC(z.mei || '')}</text>`,
    `<text x="${x0}" y="30" font-size="11" fill="#5d636b">← 左</text><text x="${x0 + haba}" y="30" font-size="11" text-anchor="end" fill="#5d636b">右 →</text>`,
    `<text x="4" y="30" font-size="11" fill="#5d636b">上から</text>`];
  z.tana.forEach((r, i) => {
    const y = 36 + i * (ch + 12);
    parts.push(`<text x="4" y="${y + ch / 2 + 4}" font-size="12" fill="#23262b">${i + 1}つめ</text>`);
    parts.push(`<line x1="${x0 - 6}" y1="${y + ch + 4}" x2="${x0 + haba + 6}" y2="${y + ch + 4}" stroke="#8a5a2b" stroke-width="4"/>`);
    r.forEach((n, j) => parts.push(hako(x0 + j * (cw + 6), y, cw, ch, n, { kara: n == null, waku, iro: '#f6ead6', sen: '#8a5a2b' })));
  });
  const H = 36 + z.tana.length * (ch + 12) + 2;
  return svg(W, H, `${z.mei || '棚'}の図（上から 何つめ・左から 何番め）`, parts);
}

// 当番表（13便のもと）：上に曜日、左に係。向きの基準が要らない表
function hyouZu(z, waku) {
  const W = 340;
  const C = z.hi.length;
  const kw = 70;
  const cw = Math.min(66, (W - 8 - kw - C * 2) / C);
  const rh = 32;
  const parts = [`<text x="4" y="14" font-size="13" fill="#23262b">${SVG_ESC(z.mei || '')}</text>`];
  parts.push(hako(4, 22, kw, rh, '', { iro: '#ebe8df', sen: '#9aa0a6', size: 12 }));
  z.hi.forEach((h, k) => parts.push(hako(4 + kw + 2 + k * (cw + 2), 22, cw, rh, h, { iro: '#ebe8df', sen: '#9aa0a6', size: 12 })));
  z.kakari.forEach((row, i) => {
    const y = 22 + (i + 1) * (rh + 2);
    parts.push(hako(4, y, kw, rh, row.mei, { iro: '#f6ead6', sen: '#9aa0a6', size: 12 }));
    row.dare.forEach((n, k) => parts.push(hako(4 + kw + 2 + k * (cw + 2), y, cw, rh, n, { waku, iro: '#ffffff', sen: '#9aa0a6', size: 12 })));
  });
  const H = 22 + (z.kakari.length + 1) * (rh + 2) + 4;
  return svg(W, H, `${z.mei || '当番表'}（上に曜日・左に係）`, parts);
}
