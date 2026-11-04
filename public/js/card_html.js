// スイッチカードの見た目（③カード・⑥育てる・⑦また見つける で同じものを使う）
import { esc } from './util.js';
import { LEVEL_JOUGEN } from './kurabe.js';

// レベルは、そのカードの中の印だけ（●の数）。カードの合計・順位・枚数は出さない。
export function levelHtml(level, levelMei, jougen) {
  if (level == null) return '';
  const tama = '●'.repeat(level) + '○'.repeat(Math.max(0, jougen - level));
  return `<p class="level"><span class="tama" aria-hidden="true">${tama}</span><span>レベル：${esc(levelMei)}</span></p>`;
}

// 12便 P2：子どもの画面のカードは短く。名前・副題・レベル・短い一文（きょう）と「べつの日は ちがうかも。」だけを見せ、
// 説明3つ（これは何か・自分でできる使い方・お願いしてよいこと）は「くわしく」の中に入れる
// 見つけたカードの一文（先生が決めた形）：レベルで言い方を変える。1：出せるかも／2：出せそう／3：出せる
const MATSUBI = ['、力が 出せるかも', '、力が 出せそう', '、力が 出せる'];
export function cardNoIchibun(c, level) {
  if (c.考えると && level >= 1 && level <= MATSUBI.length) return `${c.考えると}${MATSUBI[level - 1]}`;
  return c.きょう || c.ひとこと;
}

export function cardHtml(c, { atarashii = false, susunda = false, fukudai = '', level = null, levelMei = '', jougen = LEVEL_JOUGEN, moratta = '', otona = false, sodate = false } = {}) {
  return `<div class="switch-card" style="background:${esc(c.色)}">
      ${atarashii ? '<p class="atarashii">新しいカード</p>' : ''}
      ${susunda ? '<p class="atarashii">レベルが進んだ</p>' : ''}
      <p class="mei">${esc(c.名前)}</p>
      ${fukudai ? `<p class="fukudai">— ${esc(fukudai)}</p>` : ''}
      ${levelHtml(level, levelMei, jougen)}
      <p class="hitokoto">${esc(sodate ? (c.きょう || c.ひとこと) : cardNoIchibun(c, level))}</p>
      ${sodate ? '' : '<p class="betsu">別の日は 違うかも。</p>'}
      <details class="naka"><summary>くわしく</summary>
        ${moratta ? `<p class="moratta">${esc(moratta)}</p>` : ''}
        <h3>これは何か</h3><p>${esc(c.これは何か)}</p>
        <h3>自分でできる使い方</h3><ul>${c.自分でできる使い方.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>${otona ? 'まわりにお願いしてよいこと' : '先生にお願いしてよいこと'}</h3><ul>${c.先生にお願いしてよいこと.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
    </div>`;
}
