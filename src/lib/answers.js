// Kalit va javoblarni o'qish (parse) hamda tekshirish.

// Kirill klaviaturada terilgan, lotinga o'xshash harflar
const LOOKALIKES = {
  а: 'a', в: 'b', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'h',
};
// Faqat yopiq javoblar uchun qo'shimcha (A, B, C, D tovushi bo'yicha)
const CLOSED_EXTRA = { б: 'b', д: 'd' };

export const CLOSED_LETTERS = 'abcdef';
const SKIP_MARKERS = ['-', 'x', '*', '_'];

function mapChars(text, map) {
  return [...text].map((ch) => map[ch] ?? ch).join('');
}

function normalizeClosedText(text) {
  return mapChars(String(text).toLowerCase(), { ...LOOKALIKES, ...CLOSED_EXTRA });
}

/**
 * Yopiq savollar javobini o'qish.
 * Formatlar: "abcdab..." yoki "1a2b3c..." / "1-a 2-b" / "1)a, 2)b".
 * @param {string} text
 * @param {{ expected?: number, allowSkip?: boolean }} opts
 *   expected — kutilgan javoblar soni (o'quvchi uchun), allowSkip — "-"/"x" bilan tashlab ketish
 * @returns {{ ok: true, answers: string[] } | { ok: false, error: string }}
 */
export function parseClosed(text, { expected = null, allowSkip = false } = {}) {
  const t = normalizeClosedText(text).trim();
  if (!t) return { ok: false, error: "Javoblar bo'sh." };

  let answers;

  if (/\d/.test(t)) {
    // Raqamli format: 1a2b3c yoki 1-a 2-b
    const letterClass = allowSkip ? 'a-fx*_' : 'a-f';
    const re = new RegExp(`(\\d+)\\s*[-.):=]?\\s*([${letterClass}])`, 'g');
    const leftover = t.replace(re, '').replace(/[\s,;.]/g, '');
    if (leftover) {
      return { ok: false, error: `Tushunarsiz belgilar bor: "${leftover.slice(0, 20)}". Namuna: 1a2b3c4d...` };
    }
    const map = new Map();
    for (const m of t.matchAll(re)) {
      const num = Number(m[1]);
      if (num < 1) return { ok: false, error: 'Savol raqami 1 dan boshlanishi kerak.' };
      if (map.has(num)) return { ok: false, error: `${num}-savol ikki marta yozilgan.` };
      map.set(num, m[2]);
    }
    const total = expected ?? Math.max(...map.keys());
    const tooBig = [...map.keys()].filter((n) => n > total);
    if (tooBig.length) {
      return { ok: false, error: `Testda ${total} ta yopiq savol bor, lekin ${tooBig.join(', ')}-savol yozilgan.` };
    }
    const missing = [];
    answers = [];
    for (let n = 1; n <= total; n++) {
      if (!map.has(n)) missing.push(n);
      answers.push(map.get(n));
    }
    if (missing.length) {
      const list = missing.slice(0, 15).join(', ') + (missing.length > 15 ? ' ...' : '');
      return { ok: false, error: `Quyidagi savollar javobi yo'q: ${list}` };
    }
  } else {
    // Ketma-ket format: abcdab...
    const compact = t.replace(/[\s,;.]/g, '');
    const allowed = allowSkip ? /^[a-fx*_-]+$/ : /^[a-f]+$/;
    if (!allowed.test(compact)) {
      const bad = [...new Set(compact.replace(allowSkip ? /[a-fx*_-]/g : /[a-f]/g, ''))].join(' ');
      return { ok: false, error: `Faqat A–F harflari ishlatilishi mumkin. Noto'g'ri belgilar: ${bad}` };
    }
    answers = [...compact];
    if (expected !== null && answers.length !== expected) {
      return { ok: false, error: `${expected} ta javob kerak, siz ${answers.length} ta yubordingiz.` };
    }
  }

  answers = answers.map((a) => (SKIP_MARKERS.includes(a) ? '' : a));
  return { ok: true, answers };
}

/** Ochiq javobni solishtirish uchun normallashtirish */
export function normalizeOpen(value) {
  let s = mapChars(String(value).toLowerCase(), LOOKALIKES);
  s = s.replace(/[−–—]/g, '-'); // unicode minus va tirelar
  s = s.replace(/\s+/g, '');
  s = s.replace(/(\d),(\d)/g, '$1.$2'); // 1,5 -> 1.5
  s = s.replace(/\.$/, '');
  return s;
}

/** "12", "-3.5", "1/2", "+4" kabi qiymatni songa aylantirish, bo'lmasa null */
export function toNumber(value) {
  const s = normalizeOpen(value);
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  const frac = s.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}

export function isOpenCorrect(answer, keys) {
  const a = normalizeOpen(answer);
  if (!a) return false;
  const aNum = toNumber(a);
  return keys.some((k) => {
    const kn = normalizeOpen(k);
    if (a === kn) return true;
    const kNum = toNumber(kn);
    return aNum !== null && kNum !== null && Math.abs(aNum - kNum) < 1e-9;
  });
}

function normalizeLabel(label) {
  return mapChars(String(label).toLowerCase(), { ...LOOKALIKES, ...CLOSED_EXTRA }).replace(/\s+/g, '');
}

const LABELED_LINE = /^(\d+\s*[a-zа-я]?)\s*[=)]\s*(.*)$/i;

function splitLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Admin uchun: ochiq savollar kalitini o'qish.
 * Har qatorda bitta savol: "36a=12" yoki "36a) 12"; muqobil javoblar ";" bilan: "37=0.5;1/2".
 * Raqamsiz qatorlar yopiq savollardan keyingi raqamlar bilan nomlanadi.
 */
export function parseOpenKey(text, closedCount) {
  const lines = splitLines(text);
  if (!lines.length) return { ok: false, error: "Kalit bo'sh." };

  const labeled = lines.map((l) => l.match(LABELED_LINE));
  const labeledCount = labeled.filter(Boolean).length;
  if (labeledCount && labeledCount !== lines.length) {
    return { ok: false, error: "Yo hamma qatorlar raqamli (36a=12), yo hammasi raqamsiz bo'lsin." };
  }

  const items = [];
  const seen = new Set();
  for (let idx = 0; idx < lines.length; idx++) {
    const m = labeled[idx];
    const label = m ? normalizeLabel(m[1]) : String(closedCount + idx + 1);
    const rhs = m ? m[2] : lines[idx];
    const keys = rhs
      .split(';')
      .map((k) => k.trim())
      .filter(Boolean);
    if (!keys.length) return { ok: false, error: `${label}-savol uchun javob yozilmagan.` };
    if (seen.has(label)) return { ok: false, error: `${label}-savol ikki marta yozilgan.` };
    if (parseInt(label, 10) <= closedCount) {
      return { ok: false, error: `${label} — bu raqam yopiq savollarga tegishli (1–${closedCount}).` };
    }
    seen.add(label);
    items.push({ label, key: keys });
  }
  return { ok: true, items };
}

/**
 * O'quvchi uchun: ochiq savollar javoblarini o'qish.
 * Har qatorda bitta javob, tartib bilan; yoki "36a=12" ko'rinishida. "-" — javob yo'q.
 * @param {string[]} labels testdagi ochiq savollar nomlari
 */
export function parseOpenAnswers(text, labels) {
  const lines = splitLines(text);
  if (!lines.length) return { ok: false, error: "Javoblar bo'sh." };

  const labeled = lines.map((l) => l.match(LABELED_LINE));
  const labeledCount = labeled.filter(Boolean).length;
  const labelSet = new Set(labels);
  const clean = (v) => (v.trim() === '-' ? '' : v.trim());

  if (labeledCount === lines.length) {
    const map = new Map();
    for (const m of labeled) {
      const label = normalizeLabel(m[1]);
      if (!labelSet.has(label)) return { ok: false, error: `Testda "${label}" raqamli ochiq savol yo'q.` };
      if (map.has(label)) return { ok: false, error: `${label}-savol ikki marta yozilgan.` };
      map.set(label, clean(m[2]));
    }
    const missing = labels.filter((l) => !map.has(l));
    if (missing.length) {
      return { ok: false, error: `Quyidagi savollar javobi yo'q: ${missing.join(', ')}. Javob bo'lmasa "-" yozing.` };
    }
    return { ok: true, answers: labels.map((l) => map.get(l)) };
  }

  if (lines.length !== labels.length) {
    return {
      ok: false,
      error: `${labels.length} ta javob (har biri yangi qatorda) kerak, siz ${lines.length} ta yubordingiz.`,
    };
  }
  return { ok: true, answers: lines.map(clean) };
}

/**
 * Admin uchun: e'lon qilinmagan testda kalitni tuzatish. Har qatorda bitta savol:
 * "7=c" (yopiq) yoki "31a=12;12.0" (ochiq, muqobil javoblar ";" bilan).
 * @param {{label: string, kind: string}[]} items testdagi savollar
 * @returns {{ ok: true, fixes: Map<string, string[]> } | { ok: false, error: string }}
 */
export function parseKeyFixes(text, items) {
  const lines = splitLines(text);
  if (!lines.length) return { ok: false, error: "Hech narsa yozilmagan." };
  const byLabel = new Map(items.map((it) => [it.label, it]));
  const fixes = new Map();
  for (const line of lines) {
    const m = line.match(LABELED_LINE);
    if (!m) return { ok: false, error: `"${line.slice(0, 30)}" — format: 7=c yoki 31a=12` };
    const label = normalizeLabel(m[1]);
    const item = byLabel.get(label);
    if (!item) return { ok: false, error: `Testda "${label}" savoli yo'q.` };
    if (fixes.has(label)) return { ok: false, error: `${label}-savol ikki marta yozilgan.` };
    if (item.kind === 'closed') {
      const letter = normalizeClosedText(m[2]).trim();
      if (!/^[a-f]$/.test(letter)) return { ok: false, error: `${label} yopiq savol — bitta harf (A–F) yozing.` };
      fixes.set(label, [letter]);
    } else {
      const keys = m[2]
        .split(';')
        .map((k) => k.trim())
        .filter(Boolean);
      if (!keys.length) return { ok: false, error: `${label}-savol uchun javob yozilmagan.` };
      fixes.set(label, keys);
    }
  }
  return { ok: true, fixes };
}

/** Test savollari va javoblar asosida 0/1 vektor */
export function checkAnswers(items, answers) {
  return items.map((item, i) => {
    const a = answers[i] ?? '';
    if (!a) return 0;
    if (item.kind === 'closed') return a === item.key[0] ? 1 : 0;
    return isOpenCorrect(a, item.key) ? 1 : 0;
  });
}
