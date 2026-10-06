import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRasch, wleTheta } from '../src/lib/rasch.js';
import { computeResults, gradeFor, toTScores } from '../src/lib/scoring.js';

const logistic = (x) => 1 / (1 + Math.exp(-x));

test('CML: 2 savollik holatda aniq formula b₂ − b₁ = ln(n₁₀ / n₀₁)', () => {
  const m = [
    ...Array(37).fill([1, 0]),
    ...Array(13).fill([0, 1]),
    ...Array(20).fill([1, 1]),
    ...Array(30).fill([0, 0]),
  ];
  const res = estimateRasch(m);
  assert.equal(res.method, 'CML');
  assert.ok(Math.abs(res.difficulty[1] - res.difficulty[0] - Math.log(37 / 13)) < 1e-6);
});

test("CML: barcha javob variantlarini sanash orqali hisoblangan shartli ehtimollik bilan mos", () => {
  const rand = rng(11);
  const b = [-1.2, -0.3, 0.2, 0.6, 1.4];
  const m = Array.from({ length: 400 }, () => {
    const t = gauss(rand);
    return b.map((d) => (rand() < logistic(t - d) ? 1 : 0));
  });
  const L = 5;
  const patterns = Array.from({ length: 32 }, (_, k) => b.map((_, i) => (k >> i) & 1));
  const rows = m.filter((r) => {
    const s = r.reduce((a, c) => a + c, 0);
    return s > 0 && s < L;
  });
  // ESF ishlatmasdan: P(x | r) = exp(−Σ x·b) / Σ_{y: Σy = r} exp(−Σ y·b)
  const condLogLik = (bb) =>
    rows.reduce((tot, row) => {
      const r = row.reduce((a, c) => a + c, 0);
      const w = (p) => Math.exp(-p.reduce((a, x, i) => a + x * bb[i], 0));
      const den = patterns.filter((p) => p.reduce((a, c) => a + c, 0) === r).reduce((a, p) => a + w(p), 0);
      return tot + Math.log(w(row) / den);
    }, 0);
  const res = estimateRasch(m);
  const best = condLogLik(res.difficulty);
  // CML maksimumida har qanday kichik siljish ehtimollikni kamaytiradi
  for (let i = 0; i < L; i++) {
    for (const h of [-0.01, 0.01]) {
      const shifted = res.difficulty.map((x, k) => (k === i ? x + h : x));
      assert.ok(condLogLik(shifted) < best);
    }
  }
});

test('WLE: 0 va maksimal ball uchun chekli, simmetrik qiyinliklarda simmetrik', () => {
  const b = [-1.5, -0.5, 0.5, 1.5];
  const t0 = wleTheta(0, b);
  const t4 = wleTheta(4, b);
  assert.ok(Number.isFinite(t0) && Number.isFinite(t4));
  assert.ok(Math.abs(t0 + t4) < 1e-9);
  assert.ok(Math.abs(wleTheta(2, b)) < 1e-9);
  for (let r = 1; r <= 4; r++) assert.ok(wleTheta(r, b) > wleTheta(r - 1, b));
});

test('xato kiritilgan kalit ogohlantirish bilan belgilanadi', () => {
  const rand = rng(5);
  const b = Array.from({ length: 30 }, () => gauss(rand));
  const m = Array.from({ length: 80 }, () => {
    const t = gauss(rand);
    return b.map((d) => (rand() < logistic(t - d) ? 1 : 0));
  });
  const clean = computeResults(m);
  assert.equal(clean.items.filter((it) => it.flag).length, 0);

  // 3-savol kaliti xato: to'g'ri yechganlar xato deb, xatolar to'g'ri deb hisoblanadi
  const broken = computeResults(m.map((row) => row.map((x, i) => (i === 2 ? 1 - x : x))));
  assert.match(broken.items[2].flag, /kalit xato/);
  assert.ok(broken.items[2].ptBiserial < 0);

  // Hech kim yechmagan savol
  const none = computeResults(m.map((row) => row.map((x, i) => (i === 5 ? 0 : x))));
  assert.match(none.items[5].flag, /Hech kim/);

  // Hamma yechgan savol — ogohlantirish emas
  const all = computeResults(m.map((row) => row.map((x, i) => (i === 7 ? 1 : x))));
  assert.equal(all.items[7].flag, null);
});

test("kichik guruhda soxta ogohlantirish yo'q (1–2 kishilik sinov testi)", () => {
  // Foydalanuvchi sinovidagi holat: 14 savol, o'quvchi 11 ta to'g'ri (9, 10, 11b xato)
  const student = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1];
  const admin = new Array(14).fill(1);
  for (const m of [[student], [admin, student]]) {
    const res = computeResults(m);
    assert.deepEqual(res.items.filter((it) => it.flag), [], `${m.length} kishi: ogohlantirish bo'lmasligi kerak`);
  }
  // "Hech kim yechmagan" — 4 kishida jim, 5 kishidan boshlab ko'rsatiladi
  const group = (n) => Array.from({ length: n }, (_, k) => student.map((x, i) => (i === 3 ? 0 : (x + k + i) % 2)));
  assert.equal(computeResults(group(4)).items[3].flag, null);
  assert.match(computeResults(group(5)).items[3].flag, /Hech kim/);
});

// Takrorlanuvchi tasodifiy sonlar generatori (mulberry32)
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulate(N, L, seed = 42) {
  const rand = rng(seed);
  const theta = Array.from({ length: N }, () => gauss(rand));
  const b = Array.from({ length: L }, () => gauss(rand) * 1.2);
  const matrix = theta.map((t) => b.map((d) => (rand() < 1 / (1 + Math.exp(-(t - d))) ? 1 : 0)));
  return { theta, b, matrix };
}

function correlation(x, y) {
  const mx = x.reduce((a, v) => a + v, 0) / x.length;
  const my = y.reduce((a, v) => a + v, 0) / y.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

test('simulyatsiya qilingan parametrlarni tiklaydi', () => {
  const { theta, b, matrix } = simulate(500, 40);
  const res = estimateRasch(matrix);
  assert.ok(res.converged, 'JMLE yaqinlashishi kerak');
  assert.ok(correlation(res.difficulty, b) > 0.97, 'qiyinliklar korrelyatsiyasi');
  assert.ok(correlation(res.theta, theta) > 0.9, 'qobiliyatlar korrelyatsiyasi');
  const meanB = res.difficulty.reduce((a, v) => a + v, 0) / res.difficulty.length;
  assert.ok(Math.abs(meanB) < 1e-9, "qiyinliklar o'rtachasi 0");
});

test("bir xil ballga bir xil θ, ko'proq ballga yuqoriroq θ", () => {
  const { matrix } = simulate(200, 30, 7);
  const res = estimateRasch(matrix);
  const byScore = new Map();
  res.personScores.forEach((s, i) => {
    if (!byScore.has(s)) byScore.set(s, res.theta[i]);
    else assert.ok(Math.abs(byScore.get(s) - res.theta[i]) < 1e-6);
  });
  const scores = [...byScore.keys()].sort((a, b) => a - b);
  for (let i = 1; i < scores.length; i++) assert.ok(byScore.get(scores[i]) > byScore.get(scores[i - 1]));
});

test('ekstremal ballar (hammasi to\'g\'ri / hammasi xato) cheklangan qiymat beradi', () => {
  const matrix = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 1, 0, 0, 0],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 0, 0],
  ];
  const res = estimateRasch(matrix);
  assert.ok(res.converged);
  for (const t of [...res.theta, ...res.difficulty]) assert.ok(Number.isFinite(t));
  assert.ok(res.theta[0] > res.theta[4] && res.theta[1] < res.theta[2]);
});

test('hamma yechgan va hech kim yechmagan savollar', () => {
  const matrix = [
    [1, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 0, 0, 0],
  ];
  const res = estimateRasch(matrix);
  assert.ok(res.difficulty.every(Number.isFinite));
  assert.ok(res.difficulty[0] < res.difficulty[2] && res.difficulty[1] > res.difficulty[3]);
});

test("ajraluvchan (Guttman) ma'lumot: chekli, yaqinlashadi va ball bo'yicha qat'iy monoton", () => {
  // Kuchli guruh barcha oson savollarni, kuchsiz guruh birorta qiyin savolni yechmagan
  const matrix = Array.from({ length: 30 }, (_, k) => {
    const c = Math.round((k / 29) * 10);
    const closed = Array.from({ length: 10 }, (_, i) => (i < c ? 1 : 0));
    const open = k >= 15 ? [1, 1, 1] : k % 2 ? [1, 0, 0] : [0, 0, 0];
    return [...closed, ...open];
  });
  const res = estimateRasch(matrix);
  assert.ok(res.converged);
  assert.ok([...res.theta, ...res.difficulty].every(Number.isFinite));
  const byScore = new Map(res.personScores.map((s, i) => [s, res.theta[i]]));
  const scores = [...byScore.keys()].sort((a, b) => a - b);
  for (let i = 1; i < scores.length; i++) assert.ok(byScore.get(scores[i]) > byScore.get(scores[i - 1]) + 0.05);

  const results = computeResults(matrix);
  const sorted = [...results.persons].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].rawScore >= sorted[i].rawScore);
});

test('bitta qatnashchi va bo\'sh matritsa', () => {
  const one = computeResults([[1, 0, 1]]);
  assert.equal(one.persons[0].tScore, 50);
  assert.equal(one.persons[0].rank, 1);
  const empty = computeResults([]);
  assert.equal(empty.persons.length, 0);
});

test('T-ball va darajalar', () => {
  // SD — tanlanma (n − 1), R dagi sd() kabi
  const { tScores, mean, sd } = toTScores([-1, 0, 1]);
  assert.equal(mean, 0);
  assert.ok(Math.abs(sd - 1) < 1e-12);
  assert.deepEqual(tScores, [40, 50, 60]);

  // BMBA: maksimal ball shartli ravishda 75
  const capped = toTScores([0, 0, 0, 0, 0, 0, 0, 0, 0, 10]).tScores;
  assert.equal(capped[9], 75);
  assert.ok(capped.every((t) => t >= 0 && t <= 75));

  assert.equal(gradeFor(75), 'A+');
  assert.equal(gradeFor(70), 'A+');
  assert.equal(gradeFor(69.9), 'A');
  assert.equal(gradeFor(60), 'B+');
  assert.equal(gradeFor(55), 'B');
  assert.equal(gradeFor(50), 'C+');
  assert.equal(gradeFor(46), 'C');
  assert.equal(gradeFor(45.9), null);
});

test("o'rinlar: tenglarga bir xil o'rin", () => {
  const res = computeResults([
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 0],
  ]);
  const ranks = res.persons.map((p) => p.rank);
  assert.deepEqual(ranks, [1, 2, 2, 4]);
});
