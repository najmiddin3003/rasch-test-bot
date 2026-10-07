// Kalit qatori surilganini aniqlash. O'qituvchi kalitni kiritishda bitta javobni ikki qatorga
// bo'lib yuborsa yoki bittasini tushirib qoldirsa, undan keyingi javoblar qo'shni savolga o'tadi:
// o'quvchilarning i-savolga javoblari kalitdagi (i ± 1)-savol javobiga mos keladi.
import { isOpenCorrect, normalizeOpen } from './answers.js';

const MIN_PERSONS = 5;
// Yozma javob tasodifan boshqa savol kalitiga mos kelishi juda kam — bitta savolning o'zi dalil
const OPEN_MIN_SHARE = 0.25;
// Yopiq savolda tasodifiy moslik ko'p (1/4): yuqoriroq ulush va kamida 3 ta ketma-ket savol kerak
const CLOSED_MIN_SHARE = 0.4;
const CLOSED_MIN_RUN = 3;

const matchesKey = (item, answer, key) => (item.kind === 'closed' ? answer === key[0] : isOpenCorrect(answer, key));

function sameKey(a, b) {
  if (a.kind === 'closed') return a.key[0] === b.key[0];
  const keys = new Set(a.key.map(normalizeOpen));
  return b.key.some((k) => keys.has(normalizeOpen(k)));
}

/**
 * O'quvchilarning javoblari qo'shni savol kalitiga o'z kalitidan ancha ko'p mos keladigan savollar.
 * @param {{ label: string, kind: string, key: string[] }[]} items
 * @param {string[][]} answers har bir qatnashchining javoblari (items tartibida, '' — javobsiz)
 * @returns {{ index: number, neighbor: number, matches: number }[]} index bo'yicha saralangan
 */
export function detectKeyShift(items, answers) {
  if (answers.length < MIN_PERSONS) return [];
  const found = new Map();
  for (const offset of [1, -1]) {
    const hits = [];
    items.forEach((item, i) => {
      const other = items[i + offset];
      if (!other || other.kind !== item.kind || sameKey(item, other)) return;
      // Bitta belgili yozma kalit («-», «7», «k») tasodifan ham ko'p uchraydi: «-» ni «bilmayman» deb yozishadi
      if (other.kind === 'open' && other.key.every((k) => normalizeOpen(k).length < 2)) return;
      let answered = 0;
      let own = 0;
      let matches = 0;
      for (const row of answers) {
        const a = row[i] || '';
        if (!a) continue;
        answered++;
        if (matchesKey(item, a, item.key)) own++;
        else if (matchesKey(item, a, other.key)) matches++;
      }
      const closed = item.kind === 'closed';
      const minMatches = Math.max(closed ? 3 : 2, Math.ceil(answered * (closed ? CLOSED_MIN_SHARE : OPEN_MIN_SHARE)));
      if (matches >= minMatches && matches > 2 * own) hits.push({ index: i, neighbor: i + offset, matches });
    });

    const closedHits = new Set(hits.filter((h) => items[h.index].kind === 'closed').map((h) => h.index));
    const runLength = (i) => {
      let lo = i;
      let hi = i;
      while (closedHits.has(lo - 1)) lo--;
      while (closedHits.has(hi + 1)) hi++;
      return hi - lo + 1;
    };
    for (const hit of hits) {
      if (closedHits.has(hit.index) && runLength(hit.index) < CLOSED_MIN_RUN) continue;
      const prev = found.get(hit.index);
      if (!prev || hit.matches > prev.matches) found.set(hit.index, hit);
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

const shorten = (s, limit) => (s.length > limit ? `${s.slice(0, limit - 1)}…` : s);

/** Savol izohi: qaysi qo'shni savol kaliti nechta o'quvchining javobiga mos kelgani */
export function keyShiftFlag(neighbor, matches) {
  const key =
    neighbor.kind === 'closed' ? neighbor.key[0].toUpperCase() : `«${shorten(neighbor.key.join(' ; '), 30)}»`;
  const verb = neighbor.kind === 'closed' ? 'belgilagan' : 'yozgan';
  return `Kalit surilganga o'xshaydi: ${matches} kishi ${neighbor.label}-savol kalitini (${key}) ${verb}`;
}
