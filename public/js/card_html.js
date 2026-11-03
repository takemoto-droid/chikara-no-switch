// スイッチカードの見た目（③カード・⑥育てる・⑦また見つける で同じものを使う）
import { esc } from './util.js';
import { LEVEL_JOUGEN } from './kurabe.js';

// レベルは、そのカードの中の印だけ（●の数）。カードの合計・順位・枚数は出さない。
export function levelHtml(level, levelMei, jougen) {
  if (level == null) return '';
  const tama = '●'.repeat(level) + '○'.repeat(Math.max(0, jougen - level));
  return `<p class="level"><span class="tama" aria-hidden="true">${tama}</span><span>レベル：${esc(levelMei)}</span></p>`;
}

export function cardHtml(c, { atarashii = false, susunda = false, fukudai = '', level = null, levelMei = '', jougen = LEVEL_JOUGEN, moratta = '', otona = false } = {}) {
  return `<div class="switch-card" style="background:${esc(c.色)}">
      ${atarashii ? '<p class="atarashii">あたらしいカード</p>' : ''}
      ${susunda ? '<p class="atarashii">レベルが進んだカード</p>' : ''}
      <p class="mei">${esc(c.名前)}</p>
      ${fukudai ? `<p class="fukudai">— ${esc(fukudai)}</p>` : ''}
      ${levelHtml(level, levelMei, jougen)}
      ${moratta ? `<p class="moratta">${esc(moratta)}</p>` : ''}
      <p class="hitokoto">${esc(c.ひとこと)}</p>
      <div class="naka">
        <h3>これは何か</h3><p>${esc(c.これは何か)}</p>
        <h3>自分でできる使い方</h3><ul>${c.自分でできる使い方.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>${otona ? 'まわりにお願いしてよいこと' : '先生にお願いしてよいこと'}</h3><ul>${c.先生にお願いしてよいこと.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
    </div>`;
}
