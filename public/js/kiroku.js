// 記録の置き場所：この端末のブラウザの中（localStorage）だけ。サーバーには残さない。
// 途中で止めても、ここから続きを始められる。
import { makeJunban } from './kurabe.js';

const KEY = 'chikara-no-switch.v1';
let mem = null; // 保存できない端末のときの予備

function kara() {
  return { kids: {}, check: null, ai: {}, seq: 0 };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...kara(), ...JSON.parse(raw) };
  } catch { /* 保存できない端末 */ }
  return mem || kara();
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

export async function getRecord(id) {
  const d = await demo();
  if (d.結果[id]) return structuredClone(d.結果[id]);
  return load().kids[id] || null;
}

export function isDemo(id) {
  return String(id).startsWith('デモ');
}

export function newKid() {
  const st = load();
  st.seq += 1;
  const id = `その場${st.seq}`;
  st.kids[id] = { id, junban: makeJunban(`${id}-${Date.now()}`), kekka: {}, erabi: [], owari: false, hajime: Date.now() };
  save(st);
  return id;
}

export function saveRecord(rec) {
  if (isDemo(rec.id)) return;
  const st = load();
  st.kids[rec.id] = rec;
  save(st);
}

export function localKids() {
  return Object.values(load().kids);
}

export async function classList() {
  const d = await demo();
  return [...d.クラス, ...localKids().map((k) => ({ id: k.id, 呼び名: `${k.id}（この端末で動かした子）` }))];
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
