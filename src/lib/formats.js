// Test formatlari (shablonlar).

export const OPTION_LETTERS = 'abcdef';

/** Variantlar soni bo'yicha harflar: 4 → "abcd" */
export function optionLetters(count) {
  return OPTION_LETTERS.slice(0, count || 4);
}

/**
 * Yopiq savolning variantlar soni. Bugungi formatgacha yaratilgan testlarda maydon bo'sh —
 * shunda kalit harfiga qarab: E yoki F bo'lsa 6 ta, aks holda 4 ta.
 */
export function itemOptions(item) {
  if (item?.options) return item.options;
  return OPTION_LETTERS.indexOf(item?.key?.[0]) >= 4 ? 6 : 4;
}

/** "A–D" ko'rinishi */
export function optionRange(count) {
  const letters = optionLetters(count).toUpperCase();
  return `${letters[0]}–${letters.at(-1)}`;
}

// Esse bali o'quvchi tomonidan 75 ballik shkalada kiritiladi; yakuniy ball = (test + esse) / 2
export const ESSAY_MAX = 75;

export const FORMATS = {
  // Milliy sertifikat: ona tili va adabiyot (BMBA): test qismi + yozma ish (esse)
  ona_tili: {
    title: 'Ona tili (Milliy sertifikat)',
    closedOptions: [...Array(32).fill(4), 6, 6, 6], // 1–32: A–D, 33–35: A–F
    openLabels: ['36', '37', '38', '39', '40a', '40b', '41a', '41b', '42a', '42b', '43a', '43b', '44a', '44b'],
    essay: true,
  },
  free: {
    title: 'Erkin format',
  },
};

export function formatTitle(format) {
  return FORMATS[format]?.title ?? FORMATS.free.title;
}

/** "36" → "36-savol", "40a" → "40-savol (a)" */
export function questionName(label) {
  const m = String(label).match(/^(\d+)([a-z])?$/);
  if (!m) return `${label}-savol`;
  return m[2] ? `${m[1]}-savol (${m[2]})` : `${m[1]}-savol`;
}

/**
 * Yopiq savollar variantlarini qisqa ko'rinishda: "1–32: A–D, 33–35: A–F".
 * @param {{label: string, kind: string, options?: number}[]} items
 */
export function optionsSummary(items) {
  const closed = items.filter((i) => i.kind === 'closed');
  const parts = [];
  let start = 0;
  for (let i = 1; i <= closed.length; i++) {
    if (i === closed.length || itemOptions(closed[i]) !== itemOptions(closed[start])) {
      const from = closed[start].label;
      const to = closed[i - 1].label;
      parts.push(`${from === to ? from : `${from}–${to}`}: ${optionRange(itemOptions(closed[start]))}`);
      start = i;
    }
  }
  return parts.join(', ');
}
