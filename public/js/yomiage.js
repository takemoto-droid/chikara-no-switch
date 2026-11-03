// 読み上げ（この便ではブラウザの読み上げを使う）
// 注意：ブラウザの声は端末ごとに違い、比べた結果に混ざる。だから、どの声で読んだかを記録に残す。
// 前もって作った音声ファイルに切りかえるのは次の便。

const shiken = (() => {
  try {
    if (new URLSearchParams(location.search).get('shiken') === '1') sessionStorage.setItem('shiken', '1');
    return sessionStorage.getItem('shiken') === '1';
  } catch { return false; }
})();

let voice = null;
let junbi = null;

export function junbiYomiage() {
  if (junbi) return junbi;
  junbi = new Promise((resolve) => {
    if (shiken) { resolve(true); return; }
    if (!('speechSynthesis' in window)) { resolve(false); return; }
    const pick = () => {
      const vs = speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang));
      voice = vs[0] || null;
      return Boolean(voice);
    };
    if (pick()) { resolve(true); return; }
    let done = false;
    speechSynthesis.addEventListener('voiceschanged', () => { if (!done && pick()) { done = true; resolve(true); } });
    setTimeout(() => { if (!done) { done = true; resolve(pick()); } }, 1500);
  });
  return junbi;
}

export function koeNoNamae() {
  if (shiken) return '試験用（音なし）';
  return voice ? voice.name : 'なし';
}

export function tomeru() {
  if (!shiken && 'speechSynthesis' in window) speechSynthesis.cancel();
}

// 読み終わったら解決する。終わりの知らせが来ない端末のために、長さから決めた時間でも解決する
export function yomu(text) {
  return new Promise((resolve) => {
    if (shiken) { setTimeout(resolve, 30); return; }
    if (!voice) { resolve(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    let owari = false;
    const fin = () => { if (!owari) { owari = true; resolve(); } };
    u.onend = fin;
    u.onerror = fin;
    setTimeout(fin, 2000 + text.length * 250);
    speechSynthesis.speak(u);
  });
}
