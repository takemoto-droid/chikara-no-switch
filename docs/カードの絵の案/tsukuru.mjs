// 一覧.html を作る（node docs/カードの絵の案/tsukuru.mjs）
import { readFileSync, writeFileSync } from 'node:fs';
import { AN1, AN2, AN3, JUN } from './e.mjs';
const ROOT = new URL('../../', import.meta.url);
const cards = JSON.parse(readFileSync(new URL('public/data/cards.json', ROOT), 'utf8')).カード;
const namae = JSON.parse(readFileSync(new URL('public/data/card_namae.json', ROOT), 'utf8')).名前;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 白い線と、カードの色のコントラスト（WCAG の式）
const L = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const hi = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const kakuAn = (an) => `<section><h2>${esc(an.名前)}</h2><p>${esc(an.ねらい)}</p>
  <table><thead><tr><th>カード</th><th>カードの色の上（白い線）</th><th>白黒</th><th>色の見え方の違い（シミュレーション）</th><th>小さく（24px）</th><th>代替テキスト</th></tr></thead><tbody>
  ${JUN.map((k) => { const c = cards[k].色; return `<tr><td>${esc(namae[k])}</td>
    <td><span class="kado" style="background:${c};color:#fff">${an[k].svg}</span><span class="hi">白との差 ${hi('#ffffff', c).toFixed(1)}：1</span></td>
    <td><span class="kado" style="background:#fff;color:#111;border:1px solid #999">${an[k].svg}</span></td>
    <td><span class="kado sim" style="background:${c};color:#fff">${an[k].svg}</span></td>
    <td><span class="chiisai" style="color:#111">${an[k].svg}</span><span class="chiisai" style="background:${c};color:#fff">${an[k].svg}</span></td>
    <td>${esc(an[k].alt)}</td></tr>`; }).join('')}
  </tbody></table></section>`;
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>カードの絵の案</title>
<style>body{font-family:"BIZ UDPGothic",sans-serif;max-width:1000px;margin:20px auto;padding:0 16px;color:#23262b;background:#f7f5ef}
table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #ccc;padding:6px;font-size:13px;vertical-align:middle}
.kado{display:inline-flex;width:64px;height:64px;border-radius:12px;padding:8px;box-sizing:border-box}.kado svg,.chiisai svg{width:100%;height:100%}
.chiisai{display:inline-flex;width:24px;height:24px;margin-right:6px;border-radius:4px;padding:2px}.hi{display:block;font-size:11px;color:#555}
.sim{filter:url(#d)}section{margin:28px 0}h2{font-size:18px}</style>
<svg width="0" height="0" style="position:absolute"><filter id="d"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter></svg>
<body><h1>カードの絵の案（下書き・先生未確認）</h1>
<p>どれも自作の線の絵です。アプリにはまだつないでいません。先生が1つ選んでから、カードに入れます。</p>
<p>「色の見え方の違い」の列は、赤と緑の区別がつきにくい見え方を、おおまかに再現したものです（医学的な正確さはありません）。カードの色だけでは区別しにくい組（図で と 文で など）も、絵の形で見分けられるかを見ます。</p>
${[AN1, AN2, AN3].map(kakuAn).join('')}</body></html>`;
writeFileSync(new URL('一覧.html', import.meta.url), html);
console.log('一覧.html を作りました');
