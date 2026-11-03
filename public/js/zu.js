// 場面の図（テープ図）。計算はさせず、場面だけを見せる。
// z = { ひとつ, ひとつの名前, べつ, べつの名前, 文字, 合計? }
export function tapeZu(z) {
  const W = 340;
  const H = 120;
  const x0 = 10;
  const hitotsuW = 54;
  const n = 3; // 「何個か」を3つの箱と「…」で表す
  let x = x0;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`<rect x="${x}" y="30" width="${hitotsuW}" height="34" rx="4" fill="#e2eef3" stroke="#2f6f8f" stroke-width="2"/>`);
    parts.push(`<text x="${x + hitotsuW / 2}" y="52" font-size="13" text-anchor="middle" fill="#23262b">${z.ひとつ}円</text>`);
    x += hitotsuW;
  }
  parts.push(`<text x="${x + 14}" y="52" font-size="16" text-anchor="middle" fill="#23262b">…</text>`);
  x += 28;
  const tapeEnd = x;
  const betsuW = 76;
  parts.push(`<rect x="${x}" y="30" width="${betsuW}" height="34" rx="4" fill="#f6ead6" stroke="#8a5a2b" stroke-width="2"/>`);
  parts.push(`<text x="${x + betsuW / 2}" y="52" font-size="13" text-anchor="middle" fill="#23262b">${z.べつ}円</text>`);
  const end = x + betsuW;
  // 上のかっこ：何個か
  parts.push(`<path d="M${x0} 24 v-8 h${tapeEnd - x0} v8" fill="none" stroke="#2f6f8f" stroke-width="1.5"/>`);
  parts.push(`<text x="${(x0 + tapeEnd) / 2}" y="12" font-size="12" text-anchor="middle" fill="#2f6f8f">${z.ひとつの名前} ${z.文字} ${z.ひとつの名前 === 'えんぴつ' ? '本' : z.ひとつの名前 === 'ノート' ? '冊' : '個'}分</text>`);
  parts.push(`<text x="${x + betsuW / 2}" y="22" font-size="12" text-anchor="middle" fill="#8a5a2b">${z.べつの名前}</text>`);
  // 下のかっこ：代金
  parts.push(`<path d="M${x0} 72 v8 h${end - x0} v-8" fill="none" stroke="#23262b" stroke-width="1.5"/>`);
  parts.push(`<text x="${(x0 + end) / 2}" y="100" font-size="13" text-anchor="middle" fill="#23262b">代金${z.合計 ? `（${z.合計}円）` : ''}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="場面の図：${z.ひとつ}円の${z.ひとつの名前}がいくつかと、${z.べつ}円の${z.べつの名前}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}
