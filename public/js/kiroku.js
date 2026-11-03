// 記録の置き場所：この端末のブラウザの中（localStorage）だけ。サーバーには残さない。
// 途中で止めても、ここから続きを始められる。
// 3便から：1人の子が、別の日のゲームの「回」を重ねて持つ（kids[id] = { id, kai: [回1, 回2, …] }）。
import { makeJunban } from './kurabe.js';

const KEY = 'chikara-no-switch.v3'; // 3便で「回」を重ねる形にしたので v3
const MAE_KEY = 'chikara-no-switch.v2';
let mem = null; // 保存できない端末のときの予備

function kara() {
  return { kids: {}, check: null, ai: {}, seq: 0 };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...kara(), ...JSON.parse(raw) };
    // 2便の記録があれば、1回目として移す
    const mae = localStorage.getItem(MAE_KEY);
    if (mae) {
      const st = { ...kara(), ...JSON.parse(mae) };
      for (const [id, rec] of Object.entries(st.kids)) {
        if (!rec.kai || !Array.isArray(rec.kai)) st.kids[id] = { id, kai: [{ ...rec, kai: 1, hi: hiduke(rec.hajime) }] };
      }
      save(st);
      return st;
    }
  } catch { /* 保存できない端末 */ }
  return mem || kara();
}

export function hiduke(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function save(st) {
  mem = st;
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 保存できない端末 */ }
}

let demoCache = null;
export async function demo() {
  if (!demoCache) demoCache = await (await fetch('data/demo.json')).json();
  return demoCache;
}

// 子の記録（回の並び）
export async function getKid(id) {
  const d = await demo();
  const k = d.結果[id] ? structuredClone(d.結果[id]) : load().kids[id];
  if (!k) return null;
  const kai = (k.kai || [k]).map((r, i) => ({ ...r, id, kai: r.kai ?? i + 1 }));
  return { id, kai, renshu: k.renshu || [] };
}

// ⑥ 育てる：朝の練習の記録（日ごとの並び）。記録は本人のもの。この端末の中だけに残す
export async function getRenshu(id) {
  const k = await getKid(id);
  return k ? k.renshu : [];
}

// 今日の練習を足す、または書き直す（同じ回の中で、ひとつ終わるごとに保存する）
export function saveRenshu(id, entry) {
  if (isDemo(id)) return;
  const st = load();
  const k = st.kids[id];
  if (!k) return;
  k.renshu = k.renshu || [];
  const i = k.renshu.findIndex((r) => r.no === entry.no);
  if (i >= 0) k.renshu[i] = entry;
  else k.renshu.push(entry);
  save(st);
}

// いちばん新しい回（ゲームの画面が使う）
export async function getRecord(id) {
  const k = await getKid(id);
  return k ? k.kai[k.kai.length - 1] : null;
}

// 終わった回だけ（比べるのに使う）
export async function owattaKai(id) {
  const k = await getKid(id);
  return k ? k.kai.filter((r) => r.owari) : [];
}

export function isOtona(id) {
  return String(id).startsWith('大人');
}

export function isDemo(id) {
  return String(id).startsWith('デモ');
}

function atarashiiKai(id, n) {
  return { id, kai: n, hi: hiduke(), junban: makeJunban(`${id}-${n}-${Date.now()}`), kekka: {}, erabi: [], owari: false, hajime: Date.now() };
}

// atama：呼び名の頭（子どもは「その場」、大人が試すときは「大人」）
export function newKid(atama = 'その場') {
  const st = load();
  st.seq += 1;
  const id = `${atama}${st.seq}`;
  st.kids[id] = { id, kai: [atarashiiKai(id, 1)] };
  save(st);
  return id;
}

// 別の日の回を始める（前の回が終わっているときだけ）
export function newKai(id) {
  if (isDemo(id)) return false;
  const st = load();
  const k = st.kids[id];
  if (!k || !k.kai.length || !k.kai[k.kai.length - 1].owari) return false;
  k.kai.push(atarashiiKai(id, k.kai.length + 1));
  save(st);
  return true;
}

export function saveRecord(rec) {
  if (isDemo(rec.id)) return;
  const st = load();
  const k = st.kids[rec.id];
  if (!k) return;
  k.kai[rec.kai - 1] = rec;
  save(st);
}

// この端末で動かした子（いちばん新しい回が終わっているか・回の数）
export function localKids() {
  return Object.values(load().kids).map((k) => ({ id: k.id, owari: k.kai[k.kai.length - 1].owari, kaisu: k.kai.length }));
}

export async function classList() {
  const d = await demo();
  // 大人が試した記録は、クラスのチェック項目には出さない
  return [...d.クラス, ...localKids().filter((k) => !isOtona(k.id)).map((k) => ({ id: k.id, 呼び名: `${k.id}（この端末で動かした子）` }))];
}

// チェック項目の印（項目 id → 当てはまる子の id の並び）
export async function checkMarks() {
  const st = load();
  if (st.check) return st.check;
  return structuredClone((await demo()).チェック項目);
}

export async function toggleMark(itemId, kidId) {
  const st = load();
  if (!st.check) st.check = structuredClone((await demo()).チェック項目);
  const arr = st.check[itemId] || [];
  st.check[itemId] = arr.includes(kidId) ? arr.filter((x) => x !== kidId) : [...arr, kidId];
  save(st);
  return st.check[itemId].includes(kidId);
}

export async function atehamaruIds(kidId) {
  const m = await checkMarks();
  return Object.entries(m).filter(([, kids]) => kids.includes(kidId)).map(([id]) => id).sort();
}

export function aiCache(kidId, kind, key, value) {
  const st = load();
  st.ai[kidId] = st.ai[kidId] || {};
  if (value === undefined) {
    const c = st.ai[kidId][kind];
    return c && c.key === key ? c.value : null;
  }
  st.ai[kidId][kind] = { key, value };
  save(st);
  return value;
}
