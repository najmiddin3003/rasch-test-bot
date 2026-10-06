import { estimateRasch } from './rasch.js';

// Milliy sertifikat darajalari (T-ball bo'yicha quyi chegaralar) — BMBA "Baholash mezonlari"
export const GRADES = [
  { min: 70, grade: 'A+' },
  { min: 65, grade: 'A' },
  { min: 60, grade: 'B+' },
  { min: 55, grade: 'B' },
  { min: 50, grade: 'C+' },
  { min: 46, grade: 'C' },
];

export const PASS_MIN = GRADES[GRADES.length - 1].min;

// "Test natijalari Rash modeli asosida hisoblanganda maksimal ball shartli ravishda 75 ball" (BMBA)
export const MAX_T = 75;

// Savollarni tekshirish chegaralari. Simulyatsiyada (33 savol, 30+ qatnashchi) to'g'ri kalitli
// testda o'rtacha ~0.2 soxta signal, xato kiritilgan kalitlarning 93–100% i ushlanadi.
// 15 kishidan kam guruhda ptbis/infit juda shovqinli — ular ko'rsatilmaydi.
// Outfit ishlatilmaydi: u oson savoldagi bitta tasodifiy xatoga ham juda sezgir.
// "Hamma to'g'ri topgan" ogohlantirish emas: xato kalitga hamma bir xil mos kelib qolmaydi
// (Excel'da faqat izoh sifatida chiqadi). "Hech kim to'g'ri topmagan" juda kichik guruhda
// tasodif — 1–2 kishilik testda har bir xato javob shunday ko'rinadi.
const FLAG_MIN_PERSONS = 15;
const NONE_FLAG_MIN_PERSONS = 5;
const PTBIS_MIN = -0.1;
const INFIT_MAX = 1.5; // Linacre: MNSQ > 1.5 — o'lchashga foydasiz

/** Daraja yoki null (46 dan past — sertifikat berilmaydi) */
export function gradeFor(tScore) {
  const found = GRADES.find((g) => tScore >= g.min);
  return found ? found.grade : null;
}

const round = (v, digits = 2) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/**
 * T = 50 + 10·Z, Z = (θ − μ) / σ. σ — tanlanma standart og'ishi (n − 1), R dagi sd() kabi.
 * Natija [0, 75] oralig'ida, 0.1 gacha yaxlitlanadi.
 */
export function toTScores(thetas) {
  const n = thetas.length;
  if (!n) return { tScores: [], mean: null, sd: null };
  const m = thetas.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(thetas.reduce((a, t) => a + (t - m) ** 2, 0) / (n - 1)) : 0;
  const tScores = thetas.map((t) => {
    const z = sd > 1e-9 ? (t - m) / sd : 0;
    return Math.min(MAX_T, Math.max(0, round(50 + 10 * z, 1)));
  });
  return { tScores, mean: m, sd };
}

/**
 * Savol bo'yicha ogohlantirish (kalit xatosini topishga yordam beradi) yoki null.
 * @param {{ participants: number, calibrated: number }} counts jami va ekstremal bo'lmagan qatnashchilar
 */
function itemFlag(rasch, i, { participants, calibrated }) {
  if (rasch.constant[i] === 'all') return null;
  if (rasch.constant[i] === 'none') {
    return participants >= NONE_FLAG_MIN_PERSONS
      ? "Hech kim to'g'ri topmagan — kalitni tekshiring (yoki savol juda qiyin)"
      : null;
  }
  if (calibrated < FLAG_MIN_PERSONS) return null;
  const pt = rasch.itemPtBis[i];
  if (pt !== null && pt < PTBIS_MIN) return "Kuchli o'quvchilar ko'proq xato qilgan — kalit xato bo'lishi mumkin";
  if (rasch.itemInfit[i] > INFIT_MAX) return 'Rasch modeliga mos emas (infit yuqori) — savolni tekshiring';
  return null;
}

/**
 * Javoblar matritsasidan to'liq natija: har bir qatnashchi uchun θ, T-ball,
 * daraja va o'rin; har bir savol uchun qiyinlik va moslik statistikalari.
 * @param {number[][]} matrix
 */
export function computeResults(matrix) {
  const rasch = estimateRasch(matrix);
  const { tScores, mean, sd } = toTScores(rasch.theta);

  const persons = rasch.theta.map((theta, idx) => ({
    index: idx,
    rawScore: rasch.personScores[idx],
    theta: round(theta, 3),
    se: round(rasch.thetaSe[idx], 3),
    tScore: tScores[idx],
    grade: gradeFor(tScores[idx]),
    infit: round(rasch.personInfit[idx], 2),
    outfit: round(rasch.personOutfit[idx], 2),
    rank: null,
  }));

  // O'rin: T-ball bo'yicha kamayish tartibida, tenglarga bir xil o'rin
  const sorted = [...persons].sort((a, b) => b.tScore - a.tScore);
  sorted.forEach((p, i) => {
    p.rank = i > 0 && p.tScore === sorted[i - 1].tScore ? sorted[i - 1].rank : i + 1;
  });

  const items = rasch.difficulty.map((d, i) => ({
    correctCount: rasch.itemScores[i],
    difficulty: round(d, 3),
    se: round(rasch.difficultySe[i], 3),
    infit: round(rasch.itemInfit[i], 2),
    outfit: round(rasch.itemOutfit[i], 2),
    ptBiserial: round(rasch.itemPtBis[i], 3),
    flag: itemFlag(rasch, i, { participants: matrix.length, calibrated: rasch.calibratedPersons }),
  }));

  return {
    persons,
    items,
    stats: {
      participants: matrix.length,
      meanTheta: round(mean, 3),
      sdTheta: round(sd, 3),
      iterations: rasch.iterations,
      converged: rasch.converged,
      method: rasch.method,
      reliability: round(rasch.reliability, 3),
      kr20: round(rasch.kr20, 3),
    },
  };
}
