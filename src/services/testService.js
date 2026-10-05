import { Test } from '../models/Test.js';
import { Submission } from '../models/Submission.js';
import { checkAnswers } from '../lib/answers.js';
import { computeResults } from '../lib/scoring.js';

async function generateCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!(await Test.exists({ code }))) return code;
  }
  throw new Error('Test kodi yaratib bo\'lmadi');
}

/**
 * @param {{ name: string, createdBy: number, closedKey: string[], openItems: {label: string, key: string[]}[] }} data
 */
export async function createTest({ name, createdBy, closedKey, openItems }) {
  const items = [
    ...closedKey.map((letter, i) => ({ label: String(i + 1), kind: 'closed', key: [letter] })),
    ...openItems.map((o) => ({ label: o.label, kind: 'open', key: o.key })),
  ];
  const code = await generateCode();
  return Test.create({ code, name, createdBy, items });
}

export function findTestByCode(code) {
  return Test.findOne({ code: String(code).trim() });
}

export function countSubmissions(testId) {
  return Submission.countDocuments({ test: testId });
}

export class SubmitError extends Error {}

export async function submitAnswers(test, user, answers) {
  const fresh = await Test.findById(test._id);
  if (!fresh || fresh.status !== 'open') throw new SubmitError('Bu test yopilgan, javoblar qabul qilinmaydi.');
  const correct = checkAnswers(fresh.items, answers);
  try {
    return await Submission.create({
      test: fresh._id,
      userId: user.telegramId,
      fullName: user.fullName,
      username: user.username,
      answers,
      correct,
      rawScore: correct.reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    if (err?.code === 11000) throw new SubmitError('Siz bu testga allaqachon javob yuborgansiz.');
    throw err;
  }
}

/** Rasch bo'yicha hisoblab, natijalarni Submission va Test hujjatlariga yozadi (test.save() ham) */
async function computeAndStore(test) {
  const submissions = await Submission.find({ test: test._id }).sort({ createdAt: 1 });
  const result = computeResults(submissions.map((s) => s.correct));

  if (submissions.length) {
    await Submission.bulkWrite(
      result.persons.map((p) => ({
        updateOne: {
          filter: { _id: submissions[p.index]._id },
          update: {
            $set: {
              theta: p.theta,
              se: p.se,
              tScore: p.tScore,
              grade: p.grade,
              rank: p.rank,
              infit: p.infit,
              outfit: p.outfit,
            },
          },
        },
      })),
    );
  }

  const has = submissions.length > 0;
  test.items.forEach((item, i) => {
    const r = result.items[i];
    item.correctCount = r ? r.correctCount : 0;
    item.difficulty = has ? r.difficulty : null;
    item.se = has ? r.se : null;
    item.infit = has ? r.infit : null;
    item.outfit = has ? r.outfit : null;
    item.ptBiserial = has ? r.ptBiserial : null;
    item.flag = has ? r.flag : null;
  });
  test.stats = result.stats;
  await test.save();

  const ranked = await Submission.find({ test: test._id }).sort({ rank: 1, createdAt: 1 });
  return { test, submissions: ranked };
}

/**
 * Testni yopadi va Rasch bo'yicha hisoblaydi. Natijalar hali qatnashchilarga yuborilmaydi —
 * admin tekshirib, publishTest() ni chaqirishi kerak.
 * @returns {Promise<{ test, submissions } | null>} null — test allaqachon yopilgan/yopilmoqda
 */
export async function closeTest(testId) {
  const test = await Test.findOneAndUpdate(
    { _id: testId, status: 'open' },
    { $set: { status: 'closing' } },
    { returnDocument: 'after' },
  );
  if (!test) return null;

  try {
    test.status = 'closed';
    test.closedAt = new Date();
    test.publishedAt = null;
    return await computeAndStore(test);
  } catch (err) {
    await Test.updateOne({ _id: test._id }, { $set: { status: 'open' } });
    throw err;
  }
}

/**
 * E'lon qilinmagan testda kalitni tuzatish: barcha javoblar qayta tekshiriladi va Rasch qayta hisoblanadi.
 * @param {Map<string, string[]>} fixes savol nomi → yangi kalit(lar)
 */
export async function fixKeys(testId, fixes) {
  const test = await Test.findOne({ _id: testId, status: 'closed', publishedAt: null });
  if (!test) return null;
  for (const item of test.items) if (fixes.has(item.label)) item.key = fixes.get(item.label);
  test.markModified('items');

  const submissions = await Submission.find({ test: test._id });
  if (submissions.length) {
    await Submission.bulkWrite(
      submissions.map((s) => {
        const correct = checkAnswers(test.items, s.answers);
        return {
          updateOne: {
            filter: { _id: s._id },
            update: { $set: { correct, rawScore: correct.reduce((a, b) => a + b, 0) } },
          },
        };
      }),
    );
  }
  return computeAndStore(test);
}

/** E'lon qilinmagan testni qayta ochish (yana javob qabul qiladi) */
export async function reopenTest(testId) {
  const test = await Test.findOneAndUpdate(
    { _id: testId, status: 'closed', publishedAt: null },
    { $set: { status: 'open', closedAt: null } },
    { returnDocument: 'after' },
  );
  if (test) {
    await Submission.updateMany(
      { test: test._id },
      { $set: { theta: null, se: null, tScore: null, grade: null, rank: null, infit: null, outfit: null } },
    );
  }
  return test;
}

/** Natijalarni e'lon qilish. null — test yopilmagan yoki allaqachon e'lon qilingan */
export async function publishTest(testId) {
  const test = await Test.findOneAndUpdate(
    { _id: testId, status: 'closed', publishedAt: null },
    { $set: { publishedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!test) return null;
  const submissions = await Submission.find({ test: test._id }).sort({ rank: 1, createdAt: 1 });
  return { test, submissions };
}

/** Yuborilmay qolgan natijalar (bot natija yuborayotganda qayta ishga tushgan bo'lsa) */
export async function pendingNotifications(maxAttempts) {
  const tests = await Test.find({ status: 'closed', publishedAt: { $ne: null } });
  const result = [];
  for (const test of tests) {
    const submissions = await Submission.find({
      test: test._id,
      notified: false,
      simulated: false,
      notifyAttempts: { $lt: maxAttempts },
    });
    if (submissions.length) result.push({ test, submissions });
  }
  return result;
}

export async function deleteTest(testId) {
  await Submission.deleteMany({ test: testId });
  await Test.deleteOne({ _id: testId });
}

/**
 * Ishga tushganda: "yopilmoqda" holatida qolib ketgan testlarni tiklash va eski versiyada
 * yopilgan (natijalari darhol yuborilgan) testlarni "e'lon qilingan" deb belgilash.
 */
export async function recoverStuckTests() {
  const res = await Test.updateMany({ status: 'closing' }, { $set: { status: 'open' } });
  // Aggregation pipeline bilan yangilash — to'g'ridan-to'g'ri drayver orqali (Mongoose casting siz)
  await Test.collection.updateMany({ status: 'closed', publishedAt: { $exists: false } }, [
    { $set: { publishedAt: '$closedAt' } },
  ]);
  return res.modifiedCount;
}

/** Sinov uchun: Rasch modeli bo'yicha tasodifiy qatnashchilar qo'shish */
export async function simulateSubmissions(test, count) {
  const logistic = (x) => 1 / (1 + Math.exp(-x));
  const gauss = () => {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const existing = await Submission.countDocuments({ test: test._id, simulated: true });
  const difficulties = test.items.map(() => gauss());
  const docs = [];
  for (let k = 0; k < count; k++) {
    const theta = gauss();
    const answers = test.items.map((item, i) => {
      const ok = Math.random() < logistic(theta - difficulties[i]);
      if (item.kind === 'closed') {
        if (ok) return item.key[0];
        const wrong = [...'abcd'].filter((l) => l !== item.key[0]);
        return wrong[Math.floor(Math.random() * wrong.length)];
      }
      return ok ? item.key[0] : 'xato';
    });
    const correct = checkAnswers(test.items, answers);
    const n = existing + k + 1;
    docs.push({
      test: test._id,
      userId: -n,
      fullName: `Sinov o'quvchi ${n}`,
      answers,
      correct,
      rawScore: correct.reduce((a, b) => a + b, 0),
      simulated: true,
    });
  }
  await Submission.insertMany(docs);
  return docs.length;
}
