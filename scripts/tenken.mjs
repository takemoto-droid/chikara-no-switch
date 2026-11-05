// 言葉の点検：data/言葉の正本.json の「避ける言葉」を、機械的に探す。
// 1. 画面のもと（public/ の中のすべて）と、サーバー側の文（lib/ api/ server.mjs）
// 2. 予備の動きが出す文を、ありうる結果の組み合わせすべてで作って点検
// 3. （キーがあり、TENKEN_CLAUDE=1 のとき）Claude の出力をデモの子で作って点検
// 4. README（先生の文があるので、別に数える）
// 使い方：npm run tenken
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, tenken, seihon, soudanSaki, soudanSakiKo, soudanSakiOtona, mojiretsu } from '../lib/kotoba.mjs';
import { yobiKasetsu, yobiTsutae } from '../lib/yobi.mjs';
import { yobiRiyuu, makeSteps, namaeWoAwaseru } from '../public/js/kurabe.js';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const kekka = {};
// 06 の3章で「公開の説明に出さない」とされた言葉（言葉の正本に無いもの）も、ここで探す
const ROKU_NO_KOTOBA = ['簡易検査'];
function kiroku(name, texts) {
  const hits = [];
  texts.forEach((t, i) => tenken(t).forEach((h) => hits.push({ 場所: `${name}#${i}`, 言葉: h.言葉, 文: t.slice(Math.max(0, h.位置 - 15), h.位置 + 15) })));
  texts.forEach((t, i) => ROKU_NO_KOTOBA.forEach((w) => { if (t.includes(w)) hits.push({ 場所: `${name}#${i}`, 言葉: w, 文: t.slice(0, 30) }); }));
  kekka[name] = { 点検した文: texts.length, 避ける言葉: hits.length, hits };
}

// 1. 画面とサーバー側
const gamen = [...files(path.join(ROOT, 'public')), ...files(path.join(ROOT, 'lib')), ...files(path.join(ROOT, 'api')), path.join(ROOT, 'server.mjs')]
  .filter((f) => /\.(html|js|mjs|css|json|md|txt)$/.test(f)); // 音声などの文字でないファイルは除く
const gamenLines = [];
for (const f of gamen) {
  readFileSync(f, 'utf8').split('\n').forEach((l) => gamenLines.push(l));
}
kiroku('画面とサーバー側のファイル', gamenLines);

// 2. 予備の動きの文
const tana = JSON.parse(readFileSync(path.join(ROOT, 'public/data/tana.json'), 'utf8'));
const cards = namaeWoAwaseru(JSON.parse(readFileSync(path.join(ROOT, 'public/data/cards.json'), 'utf8')), JSON.parse(readFileSync(path.join(ROOT, 'public/data/card_namae.json'), 'utf8')));
const checklist = JSON.parse(readFileSync(path.join(ROOT, 'public/data/checklist.json'), 'utf8'));
const yobiTexts = [];
let kumiawase = 0;
const kotaeRei = Object.values(tana.D.質問).map((q) => q.選択肢[1]);
for (const saisho of ['yomu', 'kiku']) {
  for (const irekae of [false, true]) {
    const junban = { A: { saisho, irekae }, B: { saisho: irekae ? 'zu' : 'bun', irekae }, C: { saisho: irekae ? 'kugiri' : 'ikki', irekae } };
    for (let n = 0; n < 5 ** 4; n++) {
      const s = [n % 5, Math.floor(n / 5) % 5, Math.floor(n / 25) % 5, Math.floor(n / 125) % 5];
      const b = s.map((x) => x % 3); // 図の組は問いが2つ
      const kekka = {};
      ['A', 'C'].forEach((k) => s.forEach((v, i) => { kekka[`${k}-${i + 1}`] = { seikai: k === 'C' ? s[(i + n) % 4] : v }; }));
      b.forEach((v, i) => { kekka[`B-${i + 1}`] = { seikai: v }; });
      ['D1', 'D2', 'D3', 'D4'].forEach((d, i) => { kekka[d] = { kotae: kotaeRei[i] }; });
      const rec = { junban, kekka };
      kumiawase++;
      yobiTexts.push(...mojiretsu(yobiKasetsu([rec], tana, checklist.項目.slice(0, 3).map((x) => x.文))));
      yobiTexts.push(...mojiretsu(yobiTsutae([rec], cards)));
      // 回をまたぐとき：同じ記録を、向きを入れかえて2回目・3回目にする
      if (n % 25 === 0) {
        const r2 = { ...rec, kai: 2 };
        const r3 = { ...rec, kai: 3, kekka: Object.fromEntries(Object.entries(rec.kekka).map(([k, v]) => [k, v])) };
        for (const kl of [[{ ...rec, kai: 1 }, r2], [{ ...rec, kai: 1 }, r2, r3]]) {
          yobiTexts.push(...mojiretsu(yobiKasetsu(kl, tana, [])));
          yobiTexts.push(...mojiretsu(yobiTsutae(kl, cards)));
        }
      }
      for (const st of makeSteps(junban)) yobiTexts.push(yobiRiyuu(rec, st.id));
    }
  }
}
// 途中の記録（まだ比べていない）
yobiTexts.push(...mojiretsu(yobiKasetsu([{ junban: { A: { saisho: 'yomu' }, B: { saisho: 'bun' }, C: { saisho: 'ikki' } }, kekka: {} }], tana, [])));
// 引き継ぎの記録の書き出し（Should）：デモの子ぜんぶ
{
  const { hikitsugiNoBun } = await import('../public/js/hikitsugi.js');
  const kids = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo.json'), 'utf8')).結果;
  for (const [id, k] of Object.entries(kids)) {
    yobiTexts.push(...hikitsugiNoBun({ id, kai: k.kai.map((r, i) => ({ ...r, kai: i + 1 })), cards, tana, atehamaru: checklist.項目.slice(0, 2).map((x) => x.文), kakuHi: '2026-11-03' }).split('\n').filter(Boolean));
  }
}
// デモの子（回をまたぐ子を含む）
const demoKids = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo.json'), 'utf8')).結果;
for (const k of Object.values(demoKids)) {
  yobiTexts.push(...mojiretsu(yobiKasetsu(k.kai, tana, [])));
  yobiTexts.push(...mojiretsu(yobiTsutae(k.kai, cards)));
}
kiroku(`予備の動きの文（結果の組み合わせ ${kumiawase} 通り）`, [...new Set(yobiTexts)]);

// 2b. 保存した Claude の本物の文（11便・デモの子8人と計画。public/data/demo_claude.json）
{
  const hozon = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo_claude.json'), 'utf8')).文;
  kiroku('保存した Claude の文（デモの子8人・計画）', mojiretsu(hozon));
}

// 3. Claude の出力（9便で広げた：仮説・伝え方（懇談・保護者向け・一言・HR の冒頭）・次を選ぶ理由・今日の練習・計画）
// 架空のデモの子だけを使う。呼ぶ回数を少なくするため、子ごとに1回ずつ。書き直しを含めた呼び出しの回数を数える
if (process.env.TENKEN_CLAUDE === '1' && process.env.ANTHROPIC_API_KEY) {
  const { handle } = await import('../lib/api.mjs');
  const { doreNashiWoTsukeru, sodateKouho, danWoDasu, renshuNoHi } = await import('../public/js/sodateru.js');
  const { keikakuNoKo } = await import('../public/js/keikaku.js');
  const { stepsOf, yobiNext } = await import('../public/js/kurabe.js');
  const demo = JSON.parse(readFileSync(path.join(ROOT, 'public/data/demo.json'), 'utf8'));
  const gakko = JSON.parse(readFileSync(path.join(ROOT, 'public/data/gakko.json'), 'utf8'));
  const out = [];
  const tries = [];
  let kaisu = 0;
  let r12 = 0;
  const kiroku1 = (mei, r) => {
    tries.push(`${mei}：${r.dare}${r.tenken ? `（${r.tenken.kaisu}回目で通過）` : ''}${r.wake ? `（${r.wake}）` : ''}`);
    if (r.dare === 'claude') kaisu += r.tenken?.kaisu || 1;
  };
  const kodomo = [];
  for (const [n, kid] of Object.values(demo.結果).entries()) {
    const kai = doreNashiWoTsukeru(kid.kai.map((r, i) => ({ ...r, kai: r.kai ?? i + 1 })), kid.renshu || []);
    const rec = kai[kai.length - 1];
    for (const name of ['kasetsu', 'tsutae']) {
      const [, r] = await handle(name, 'POST', { record: rec, kai, atehamaru: ['c04', 'c14'] }, process.env, 'tenken');
      kiroku1(`${kid.id}/${name}`, r);
      out.push(...mojiretsu({ a: r.kasetsu, b: r.tsugi, c: r.konkyo, d: r.kondan, e: r.hogosha, f: r.hitokoto, g: r.hr }));
      // R12：仮説に「確かめた回数」「参考程度・決めるのは先生」が付いている（画面の側で付けるものを、返す値で確かめる）
      if (name === 'kasetsu' && !(r.kakunin && r.sankou === '参考程度・決めるのは先生' && /かも/.test(r.kasetsu || ''))) r12++;
    }
    // 次を選ぶ理由：練習が終わって、選ぶ余地がある所まで進めた記録
    const half = { junban: rec.junban, kekka: {}, dankai: rec.dankai, shurui: rec.shurui };
    for (let k = 0; k < 3; k++) { const id = yobiNext(half); if (id) half.kekka[id] = rec.kekka[id] ?? { seikai: 2, kazu: 4 }; }
    const [, t] = await handle('tsugi', 'POST', { record: half }, process.env, 'tenken');
    kiroku1(`${kid.id}/tsugi`, t);
    out.push(t.riyuu);
    // 今日の練習：候補が2つ以上あるときだけ Claude が選ぶ（1つなら決まった文）
    const kouho = sodateKouho(kai) || ['yomu', 'zu'];
    if (kouho.length > 1) {
      const [, sd] = await handle('sodate', 'POST', { kouho, jokyou: kouho.map((m) => ({ mode: m, ...danWoDasu(kid.renshu || [], m), hi: renshuNoHi(kid.renshu || [], m).length })) }, process.env, 'tenken');
      kiroku1(`${kid.id}/sodate`, sd);
      out.push(sd.riyuu);
    }
    kodomo.push(keikakuNoKo(`子${n + 1}`, kai, kid.renshu || []));
  }
  const [, kk] = await handle('keikaku', 'POST', { settei: gakko.設定, kodomo }, process.env, 'tenken');
  kiroku1('クラス/keikaku', kk);
  out.push(kk.zentai, ...(kk.ko || []).map((x) => x.bun));
  kiroku('Claude の出力（デモの子）', out.filter(Boolean));
  kekka['Claude の出力（デモの子）'].呼び出し = [...tries, `Claude を呼んだ回数（書き直しを含む）：${kaisu}回`, `仮説に「確かめた回数」「参考程度・決めるのは先生」「〇〇かも」が無かったもの：${r12}件`];
} else {
  kekka['Claude の出力'] = { 説明: 'キーが無い（または TENKEN_CLAUDE=1 が無い）ので省略。Claude の出力は、サーバーが毎回この点検を通してから画面に出す（lib/claude.mjs）。' };
}

// 制作が書いた文書（出典の題名を写した 権利と出典.md・研究の言葉を引く 科学的根拠 は除く）
kiroku('制作が書いた文書（docs/）', ['デプロイの手順.md', '先生が確かめる一覧.md', '合成データでの確かめ.md', '子どもの安全とプライバシー.md', '概要_下書き.md', '先生の画面の見やすさ.md', '動画素材/README.md', '見直し_4便.md', '見直し_5便.md', '制作の記録.md', '線の比べ_6便.md', '見直し_6便.md', '段階の比べ_7便.md', '見直し_7便.md', '見直し_9便.md', 'Claudeの出力の点検_9便.md', '棚Bを音声でも出す案.md', '困りごとの数字の案.md', 'カードの絵の案/見直し.md', '音声の聞き比べ/説明.md', '科学的根拠のあること_ないこと.md']
  .flatMap((f) => readFileSync(path.join(ROOT, 'docs', f), 'utf8').split('\n')));

// 4. README
kiroku('README.md（先生の文を含む）', readFileSync(path.join(ROOT, 'README.md'), 'utf8').split('\n'));

// 相談先の文の写しが正本と同じか
const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
const utsushi = app.match(/SOUDAN_UTSUSHI = '([^']+)'/)?.[1];
const utsushiOtona = app.match(/SOUDAN_OTONA_UTSUSHI = '([^']+)'/)?.[1];
const utsushiKo = app.match(/SOUDAN_KO_UTSUSHI = '([^']+)'/)?.[1];
const soudanOK = utsushi === soudanSaki() && utsushiOtona === soudanSakiOtona() && utsushiKo === soudanSakiKo();

console.log('=== 言葉の点検（言葉の正本 版', seihon()['版'], '） ===');
let ng = 0;
for (const [name, k] of Object.entries(kekka)) {
  if (k.説明) { console.log(`- ${name}：${k.説明}`); continue; }
  console.log(`- ${name}：点検した文 ${k.点検した文} 件／避ける言葉 ${k.避ける言葉} 件`);
  if (k.呼び出し) k.呼び出し.forEach((t) => console.log(`    ${t}`));
  k.hits.forEach((h) => console.log(`    ${h.場所}「…${h.文}…」`));
  if (!name.startsWith('README')) ng += k.避ける言葉;
}
console.log(`- 相談先の文（保護者用・子どもの短い文・大人用）の写しが正本と同じ：${soudanOK ? 'はい' : 'いいえ'}`);
if (ng > 0 || !soudanOK) {
  console.log('\n画面・サーバー側・予備の動き・Claude の出力に避ける言葉がありました。書き直してください。');
  process.exit(1);
}
console.log('\n画面・サーバー側・予備の動き・Claude の出力：避ける言葉 0 件');
