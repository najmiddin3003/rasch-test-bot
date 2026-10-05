// Dixotomik Rasch modeli: P(x=1) = 1 / (1 + exp(-(θ - b)))
//
// BMBA (Milliy sertifikat) hisob-kitobni R dagi dexter paketida bajaradi; dexter savollarni
// CML (conditional maximum likelihood) usulida kalibrlaydi. Shu modul ham shunday:
//   1) Doimiy savollar (hamma to'g'ri / hech kim to'g'ri emas) ajratiladi — ular qatnashchilarni
//      farqlamaydi va θ ga matematik jihatdan ta'sir qilmaydi.
//   2) Savol qiyinliklari (b) — CML. Ekstremal ballli qatnashchilar CML da qatnashmaydi.
//      CML yechimi mavjud bo'lmasa (Fischer sharti: savollar grafi kuchli bog'langan emas —
//      masalan kichik guruhdagi Guttman shakli) zaif prior b ~ N(0, 3²) qo'shiladi.
//   3) Qobiliyat (θ) — WLE (Warm, 1989): 0 va maksimal ball uchun ham chekli; θ to'g'ri
//      javoblar soniga qat'iy monoton bog'liq (Rasch modelida xom ball — yetarli statistika).
//   4) Moslik: infit/outfit MNSQ, tuzatilgan nuqta-biserial korrelyatsiya, ishonchlilik.

const logistic = (x) => 1 / (1 + Math.exp(-x));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const PRIOR_SD = 3;

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((a, v) => a + (v - m) ** 2, 0) / (arr.length - 1);
}

/**
 * Elementar simmetrik funksiyalar γ_r(ε), r = 0..n.
 * Toshib ketmasligi uchun masshtablangan: γ_r = g[r] · e^ls.
 */
function esf(eps) {
  const n = eps.length;
  const g = new Float64Array(n + 1);
  g[0] = 1;
  let ls = 0;
  for (let i = 0; i < n; i++) {
    const e = eps[i];
    for (let r = i + 1; r >= 1; r--) g[r] += e * g[r - 1];
    let m = 0;
    for (let r = 0; r <= i + 1; r++) if (g[r] > m) m = g[r];
    for (let r = 0; r <= i + 1; r++) g[r] /= m;
    ls += Math.log(m);
  }
  return { g, ls };
}

/** Fischer sharti: i→j qirrasi, agar kimdir i ni to'g'ri, j ni xato yechgan bo'lsa */
function isStronglyConnected(rows, L) {
  const adj = Array.from({ length: L }, () => new Uint8Array(L));
  for (const row of rows) {
    const ones = [];
    const zeros = [];
    for (let i = 0; i < L; i++) (row[i] ? ones : zeros).push(i);
    for (const i of ones) for (const j of zeros) adj[i][j] = 1;
  }
  const reachesAll = (forward) => {
    const seen = new Uint8Array(L);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const u = stack.pop();
      for (let v = 0; v < L; v++) {
        if (!seen[v] && (forward ? adj[u][v] : adj[v][u])) {
          seen[v] = 1;
          stack.push(v);
        }
      }
    }
    return seen.every(Boolean);
  };
  return reachesAll(true) && reachesAll(false);
}

/**
 * CML kalibrovka (diagonal Nyuton + chiziqli qidiruv, log-ehtimollik har qadamda o'sadi).
 * @param {number[][]} rows faqat 0 < ball < L bo'lgan qatnashchilar (L — savollar soni)
 * @param {number} lambda prior aniqligi (0 — sof CML)
 */
function calibrateCML(rows, L, { maxIter = 1000, tol = 1e-7, lambda = 0 } = {}) {
  const N = rows.length;
  const s = new Array(L).fill(0);
  const nr = new Array(L + 1).fill(0);
  for (const row of rows) {
    let r = 0;
    for (let i = 0; i < L; i++) {
      s[i] += row[i];
      r += row[i];
    }
    nr[r]++;
  }

  const logLik = (b) => {
    const { g, ls } = esf(b.map((x) => Math.exp(-x)));
    let ll = 0;
    for (let i = 0; i < L; i++) ll -= s[i] * b[i] + (lambda * b[i] * b[i]) / 2;
    for (let r = 1; r < L; r++) if (nr[r]) ll -= nr[r] * (Math.log(g[r]) + ls);
    return ll;
  };

  let b = s.map((v) => {
    const sv = clamp(v, 0.5, N - 0.5);
    return Math.log((N - sv) / sv);
  });
  const m0 = mean(b);
  b = b.map((x) => x - m0);
  let ll = logLik(b);
  let V = new Array(L).fill(0);
  let iterations = 0;
  let converged = false;

  while (iterations < maxIter) {
    iterations++;
    const eps = b.map((x) => Math.exp(-x));
    const full = esf(eps);
    const E = new Array(L).fill(0);
    V = new Array(L).fill(0);
    for (let i = 0; i < L; i++) {
      const without = esf(eps.filter((_, k) => k !== i));
      const scale = Math.exp(without.ls - full.ls);
      for (let r = 1; r < L; r++) {
        if (!nr[r]) continue;
        const p = (eps[i] * without.g[r - 1] * scale) / full.g[r];
        E[i] += nr[r] * p;
        V[i] += nr[r] * p * (1 - p);
      }
    }

    const grad = b.map((bi, i) => E[i] - s[i] - lambda * bi);
    const step = grad.map((gi, i) => clamp(gi / (V[i] + lambda), -1, 1));
    if (Math.max(...grad.map(Math.abs)) < 1e-9 * Math.max(1, N)) {
      converged = true;
      break;
    }

    // Chiziqli qidiruv: log-ehtimollik kamaymasligi kerak
    let t = 1;
    let next;
    let nextLl;
    for (let k = 0; k < 30; k++) {
      next = b.map((bi, i) => bi + t * step[i]);
      const m = mean(next);
      next = next.map((x) => x - m);
      nextLl = logLik(next);
      if (nextLl >= ll - 1e-12) break;
      t /= 2;
    }
    const maxDelta = Math.max(...next.map((x, i) => Math.abs(x - b[i])));
    b = next;
    ll = nextLl;
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }

  return { b, se: V.map((v) => 1 / Math.sqrt(v + lambda)), iterations, converged };
}

function infoAt(theta, difficulties) {
  let E = 0;
  let I = 0;
  let J = 0;
  for (const d of difficulties) {
    const p = logistic(theta - d);
    const w = p * (1 - p);
    E += p;
    I += w;
    J += w * (1 - 2 * p);
  }
  return { E, I, J };
}

/** Warm (1989) WLE: r − E(θ) + J(θ) / (2·I(θ)) = 0 tenglamasining yechimi (bisektsiya) */
export function wleTheta(score, difficulties) {
  if (!difficulties.length) return 0;
  const f = (t) => {
    const { E, I, J } = infoAt(t, difficulties);
    const bias = I > 1e-300 ? J / (2 * I) : t < 0 ? 0.5 : -0.5;
    return score - E + bias;
  };
  let lo = -40;
  let hi = 40;
  for (let k = 0; k < 200 && hi - lo > 1e-12; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Berilgan qobiliyatlarda `score` marta yechilgan savolning qiyinligi */
function solveDifficulty(score, thetas) {
  let b = 0;
  for (let k = 0; k < 200; k++) {
    let e = 0;
    let v = 0;
    for (const t of thetas) {
      const p = logistic(t - b);
      e += p;
      v += p * (1 - p);
    }
    if (!(v > 1e-12)) break;
    const delta = clamp((score - e) / v, -1, 1);
    b -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  return b;
}

function correlation(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (x[k] - mx) * (y[k] - my);
    sxx += (x[k] - mx) ** 2;
    syy += (y[k] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * @param {number[][]} matrix N×L, qiymatlar 0 yoki 1 (qatnashchi × savol)
 */
export function estimateRasch(matrix, options = {}) {
  const { priorSd = PRIOR_SD } = options;
  const N = matrix.length;
  const L = N ? matrix[0].length : 0;

  const personScores = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const itemScores = new Array(L).fill(0);
  for (const row of matrix) for (let i = 0; i < L; i++) itemScores[i] += row[i];

  // 1) O'zgaruvchan (qatnashchilarni farqlaydigan) savollar
  const varItems = [];
  for (let i = 0; i < L; i++) if (itemScores[i] > 0 && itemScores[i] < N) varItems.push(i);
  const Lv = varItems.length;
  const rv = matrix.map((row) => varItems.reduce((a, i) => a + row[i], 0));
  const calibIdx = [];
  for (let n = 0; n < N; n++) if (rv[n] > 0 && rv[n] < Lv) calibIdx.push(n);
  const calibRows = calibIdx.map((n) => varItems.map((i) => matrix[n][i]));

  // 2) Savollar kalibrovkasi
  let bVar = [];
  let seVar = [];
  let method = 'none';
  let iterations = 0;
  let converged = true;
  if (Lv >= 2 && calibRows.length) {
    const connected = isStronglyConnected(calibRows, Lv);
    const res = calibrateCML(calibRows, Lv, { lambda: connected ? 0 : 1 / priorSd ** 2 });
    ({ iterations, converged } = res);
    bVar = res.b;
    seVar = res.se;
    method = connected ? 'CML' : 'CML+prior';
  } else if (Lv >= 1) {
    bVar = varItems.map((i) => Math.log((N - itemScores[i]) / itemScores[i]));
    const m = mean(bVar);
    bVar = bVar.map((x) => x - m);
    seVar = bVar.map(() => null);
    method = 'logit';
  }

  // 3) Qobiliyatlar — WLE, har bir mumkin bo'lgan ball uchun bir marta
  const table = Array.from({ length: Lv + 1 }, (_, r) => wleTheta(r, bVar));
  const theta = rv.map((r) => table[r]);
  const thetaSe = theta.map((t) => (Lv ? 1 / Math.sqrt(infoAt(t, bVar).I) : null));

  // 4) Barcha savollar uchun qiyinlik (doimiylari — 0.3 surilgan ball bo'yicha, faqat ma'lumot uchun)
  const difficulty = new Array(L).fill(null);
  const difficultySe = new Array(L).fill(null);
  const constant = new Array(L).fill(null);
  varItems.forEach((i, k) => {
    difficulty[i] = bVar[k];
    difficultySe[i] = seVar[k];
  });
  for (let i = 0; i < L; i++) {
    if (difficulty[i] !== null) continue;
    constant[i] = itemScores[i] === 0 ? 'none' : 'all';
    difficulty[i] = N ? solveDifficulty(clamp(itemScores[i], 0.3, N - 0.3), theta) : 0;
  }

  // 5) Moslik statistikalari (ekstremal qatnashchilar va doimiy savollarsiz)
  const itemInfit = new Array(L).fill(null);
  const itemOutfit = new Array(L).fill(null);
  const itemPtBis = new Array(L).fill(null);
  const personInfit = new Array(N).fill(null);
  const personOutfit = new Array(N).fill(null);
  if (calibIdx.length) {
    const iy2 = new Array(Lv).fill(0);
    const iw = new Array(Lv).fill(0);
    const iz2 = new Array(Lv).fill(0);
    for (const n of calibIdx) {
      let py2 = 0;
      let pw = 0;
      let pz2 = 0;
      varItems.forEach((i, k) => {
        const p = logistic(theta[n] - bVar[k]);
        const w = p * (1 - p);
        const y = matrix[n][i] - p;
        iy2[k] += y * y;
        iw[k] += w;
        iz2[k] += (y * y) / w;
        py2 += y * y;
        pw += w;
        pz2 += (y * y) / w;
      });
      personInfit[n] = py2 / pw;
      personOutfit[n] = pz2 / Lv;
    }
    varItems.forEach((i, k) => {
      itemInfit[i] = iy2[k] / iw[k];
      itemOutfit[i] = iz2[k] / calibIdx.length;
      const x = calibIdx.map((n) => matrix[n][i]);
      const rest = calibIdx.map((n) => rv[n] - matrix[n][i]);
      itemPtBis[i] = correlation(x, rest);
    });
  }

  // 6) Ishonchlilik: Rasch (qatnashchilarni ajratish) va klassik KR-20
  let reliability = null;
  if (calibIdx.length >= 3) {
    const v = variance(calibIdx.map((n) => theta[n]));
    const err = mean(calibIdx.map((n) => thetaSe[n] ** 2));
    reliability = v > 0 ? clamp((v - err) / v, 0, 1) : 0;
  }
  let kr20 = null;
  if (N >= 3 && L >= 2) {
    const vTotal = variance(personScores);
    const pq = itemScores.reduce((a, s) => a + (s / N) * (1 - s / N), 0);
    kr20 = vTotal > 0 ? (L / (L - 1)) * (1 - pq / ((vTotal * (N - 1)) / N)) : null;
  }

  return {
    theta,
    thetaSe,
    difficulty,
    difficultySe,
    constant,
    personScores,
    itemScores,
    itemInfit,
    itemOutfit,
    itemPtBis,
    personInfit,
    personOutfit,
    reliability,
    kr20,
    calibratedPersons: calibIdx.length,
    method,
    iterations,
    converged,
  };
}
