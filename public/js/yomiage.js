// 読み上げ
// 2便から：課題文と問いは、前もって作った音声（public/onsei/）を使う。44便から声は VOICEVOX:No.7（読み聞かせ）。
//   どの端末でも同じ声になるので、比べた結果に端末の声の違いが混ざらない。
// 前もって作った音声が無い文だけ、ブラウザの読み上げを使う。どの声で読んだかを記録に残す。

const shiken = (() => {
  try {
    if (new URLSearchParams(location.search).get('shiken') === '1') sessionStorage.setItem('shiken', '1');
    return sessionStorage.getItem('shiken') === '1';
  } catch { return false; }
})();

export const MAE_NO_KOE = '前もって作った音声（VOICEVOX:No.7）';
let voice = null;
let taiou = {};
let junbi = null;
let ima = null; // 今鳴っている音声
let saigoNoKoe = null;

async function taiouWoYomu() {
  try {
    const r = await fetch('onsei/onsei.json');
    if (r.ok) taiou = (await r.json()).音声 || {};
  } catch { taiou = {}; }
}

function browserNoKoe() {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(false); return; } // 端末に読み上げが無いときは、声なし
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
}

// 読み上げが使えるか（前もって作った音声があれば使える）
export function junbiYomiage() {
  if (junbi) return junbi;
  junbi = (async () => {
    if (shiken) return true;
    await taiouWoYomu();
    const b = await browserNoKoe();
    return Object.keys(taiou).length > 0 || b;
  })();
  return junbi;
}

export function maeNoOnseiAru(text) {
  return Boolean(taiou[text]);
}

// この文を、この端末で読めるか（前もって作った音声があるか、端末に日本語の声があるか）
export function yomeru(text) {
  return shiken || maeNoOnseiAru(text) || Boolean(voice);
}

export function koeNoNamae() {
  if (shiken) return '試験用（音なし）';
  return saigoNoKoe || (voice ? voice.name : 'なし');
}

export function tomeru() {
  if (ima) { ima.pause(); ima = null; }
  if (!shiken && window.speechSynthesis) speechSynthesis.cancel();
}

function browserDeYomu(text) {
  return new Promise((resolve) => {
    if (!voice) { resolve(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    saigoNoKoe = `ブラウザの声（${voice.name}）`;
    let owari = false;
    const fin = () => { if (!owari) { owari = true; resolve(); } };
    u.onend = fin;
    u.onerror = fin;
    setTimeout(fin, 2000 + text.length * 250);
    speechSynthesis.speak(u);
  });
}

// 読み終わったら解決する
export function yomu(text) {
  if (shiken) return new Promise((r) => setTimeout(r, 30));
  tomeru();
  const file = taiou[text];
  if (!file) return browserDeYomu(text);
  return new Promise((resolve) => {
    const a = new Audio(`onsei/${file}`);
    ima = a;
    saigoNoKoe = MAE_NO_KOE;
    let owari = false;
    const fin = () => { if (!owari) { owari = true; if (ima === a) ima = null; resolve(); } };
    a.onended = fin;
    a.onpause = fin;
    a.onerror = () => { if (!owari) { owari = true; browserDeYomu(text).then(resolve); } };
    a.play().catch(() => { if (!owari) { owari = true; browserDeYomu(text).then(resolve); } });
  });
}
