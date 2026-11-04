// カードの絵の案（13便のもと・下書き・先生未確認）。どれも自作の線の絵（SVG）。アプリにはまだつないでいない。
// 決まり：白黒でも分かる／小さくても見える（24px）／体の部位・性格・優劣・型に見える絵は使わない／文字と意味がぶつからない／代替テキストを付ける
// 線の色は currentColor（カードの上では白、白い紙の上では黒）。viewBox は 64×64、線の太さは 4〜5。
const S = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// 案1「道具」：その出し方で使う道具を、そのまま描く
export const AN1 = {
  名前: '案1　道具（その出し方で使う物）',
  ねらい: '出し方の道具を描く。何のカードかが、名前を読まなくても見当がつく。',
  kiku: { alt: 'スピーカーと音の波', svg: S('<path d="M10 26h10l14-11v34L20 38H10z"/><path d="M42 24c4 4 4 12 0 16"/><path d="M49 18c8 8 8 20 0 28"/>') },
  yomu: { alt: '開いた本', svg: S('<path d="M32 18c-6-4-14-5-22-4v34c8-1 16 0 22 4c6-4 14-5 22-4V14c-8-1-16 0-22 4z"/><path d="M32 18v34"/>') },
  zu: { alt: '四角と丸と矢印の図', svg: S('<rect x="8" y="10" width="20" height="16" rx="2"/><circle cx="46" cy="46" r="9"/><path d="M28 26l12 12"/><path d="M33 38h7v-7"/>') },
  bun: { alt: '横書きの文の行', svg: S('<path d="M10 16h44"/><path d="M10 28h44"/><path d="M10 40h44"/><path d="M10 52h28"/>') },
  kugiru: { alt: '一つずつ区切った3つの箱', svg: S('<rect x="6" y="24" width="14" height="16" rx="2"/><rect x="25" y="24" width="14" height="16" rx="2"/><rect x="44" y="24" width="14" height="16" rx="2"/>') },
  ikki: { alt: 'ひとまとまりの長い帯', svg: S('<rect x="6" y="24" width="52" height="16" rx="3"/><path d="M14 32h36"/>') },
  dore: { alt: '4つの出し方の印が並ぶ', svg: S('<rect x="8" y="8" width="20" height="20" rx="3"/><rect x="36" y="8" width="20" height="20" rx="3"/><rect x="8" y="36" width="20" height="20" rx="3"/><rect x="36" y="36" width="20" height="20" rx="3"/><path d="M13 18l4 4l7-8"/><path d="M41 18l4 4l7-8"/><path d="M13 46l4 4l7-8"/><path d="M41 46l4 4l7-8"/>') },
  tameshita: { alt: '点を通る道すじ', svg: S('<path d="M8 50c10 0 10-18 20-18s10-16 20-16h8"/><circle cx="8" cy="50" r="3" fill="currentColor"/><circle cx="28" cy="32" r="3" fill="currentColor"/><circle cx="48" cy="16" r="3" fill="currentColor"/>') },
};

// 案2「場面」：その出し方で考えている場面を、小さな絵で描く（道具＋机の線）
export const AN2 = {
  名前: '案2　場面（机の上で考えている様子）',
  ねらい: '机の上の物で、どんな場面で力が出たかを表す。人は描かない（顔・体の部位を使わない）。',
  kiku: { alt: '机の上のタブレットから音が出ている', svg: S('<path d="M6 52h52"/><rect x="18" y="30" width="22" height="18" rx="3"/><path d="M45 30c3 3 3 9 0 12"/><path d="M51 25c6 6 6 16 0 22"/><path d="M25 39h8"/>') },
  yomu: { alt: '机の上に開いた本としおり', svg: S('<path d="M6 52h52"/><path d="M32 30c-5-3-12-4-18-3v19c6-1 13 0 18 3c5-3 12-4 18-3V27c-6-1-13 0-18 3z"/><path d="M32 30v19"/><path d="M42 14v14l-4-3l-4 3V14"/>') },
  zu: { alt: '机の上の紙に描いた図', svg: S('<path d="M6 52h52"/><rect x="14" y="14" width="36" height="32" rx="2"/><rect x="20" y="20" width="10" height="8"/><circle cx="40" cy="36" r="5"/><path d="M30 28l6 4"/>') },
  bun: { alt: '机の上の紙に書いた文', svg: S('<path d="M6 52h52"/><rect x="14" y="12" width="36" height="34" rx="2"/><path d="M20 22h24"/><path d="M20 30h24"/><path d="M20 38h14"/>') },
  kugiru: { alt: '机の上のカードが一枚ずつ並ぶ', svg: S('<path d="M6 52h52"/><rect x="8" y="26" width="12" height="18" rx="2"/><rect x="26" y="26" width="12" height="18" rx="2"/><rect x="44" y="26" width="12" height="18" rx="2"/><path d="M14 18v4"/><path d="M32 18v4"/><path d="M50 18v4"/>') },
  ikki: { alt: '机の上に一枚の長い紙', svg: S('<path d="M6 52h52"/><rect x="8" y="24" width="48" height="20" rx="2"/><path d="M14 31h36"/><path d="M14 38h28"/>') },
  dore: { alt: '机の上に本とタブレットと図と紙', svg: S('<path d="M6 52h52"/><rect x="8" y="34" width="12" height="14" rx="2"/><rect x="24" y="30" width="16" height="18" rx="2"/><rect x="44" y="36" width="12" height="12" rx="2"/><path d="M12 22h40"/><path d="M28 14l4-4l4 4"/>') },
  tameshita: { alt: '机の上で、順に試した印', svg: S('<path d="M6 52h52"/><circle cx="14" cy="36" r="5"/><circle cx="32" cy="36" r="5"/><circle cx="50" cy="36" r="5"/><path d="M19 36h8"/><path d="M37 36h8"/><path d="M28 18h8"/>') },
};

// 案3「記号」：点・線・面の組み合わせだけで表す（小さくても形で見分けられる）
export const AN3 = {
  名前: '案3　記号（点・線・面だけ）',
  ねらい: '形の違いをはっきりさせ、24px でも見分けられるようにする。意味は名前と一緒に覚える。',
  kiku: { alt: '広がる3本の波', svg: S('<path d="M22 22c4 6 4 14 0 20"/><path d="M32 14c8 10 8 26 0 36"/><path d="M42 6c12 14 12 38 0 52"/>') },
  yomu: { alt: '縦に並ぶ2本の線と点', svg: S('<path d="M20 10v44"/><path d="M36 10v44"/><circle cx="50" cy="14" r="4" fill="currentColor"/>') },
  zu: { alt: '三角と四角と丸', svg: S('<path d="M18 10l10 18H8z"/><rect x="36" y="10" width="18" height="18"/><circle cx="32" cy="46" r="10"/>') },
  bun: { alt: '4本の横線', svg: S('<path d="M10 14h44"/><path d="M10 26h44"/><path d="M10 38h44"/><path d="M10 50h44"/>') },
  kugiru: { alt: '短い線が3つ、すき間をあけて並ぶ', svg: S('<path d="M8 32h10"/><path d="M27 32h10"/><path d="M46 32h10"/>') },
  ikki: { alt: '一本の長い線', svg: S('<path d="M8 32h48"/><path d="M48 24l8 8l-8 8"/>') },
  dore: { alt: '4つの点が四角に並ぶ', svg: S('<circle cx="18" cy="18" r="6" fill="currentColor"/><circle cx="46" cy="18" r="6" fill="currentColor"/><circle cx="18" cy="46" r="6" fill="currentColor"/><circle cx="46" cy="46" r="6" fill="currentColor"/>') },
  tameshita: { alt: '点線の道', svg: S('<path d="M8 48h8"/><path d="M22 40h8"/><path d="M36 32h8"/><path d="M50 24h6"/>') },
};

export const JUN = ['kiku', 'yomu', 'zu', 'bun', 'kugiru', 'ikki', 'dore', 'tameshita'];
