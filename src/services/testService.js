import { Test } from '../models/Test.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { checkAnswers } from '../lib/answers.js';
import { ESSAY_MAX, itemOptions, optionLetters } from '../lib/formats.js';
import { detectKeyShift, keyShiftFlag } from '../lib/keyShift.js';
import { computeResults } from '../lib/scoring.js';

async function generateCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!(await Test.exists({ code }))) return code;
  }
  throw new Error('Test kodi yaratib bo\'lmadi');
}

/**
 * @param {{
 *   name: string, createdBy: number, closedKey: string[], closedOptions: number[],
 *   openItems: {label: string, key: string[]}[], format?: string, hasEssay?: boolean
 * }} data
 */
export async function createTest({ name, createdBy, closedKey, closedOptions, openItems, format = 'free', hasEssay = false }) {
  const items = [
    ...closedKey.map((letter, i) => ({ label: String(i + 1), kind: 'closed', options: closedOptions[i], key: [letter] })),
    ...openItems.map((o) => ({ label: o.label, kind: 'open', key: o.key })),
  ];
  const code = await generateCode();
  return Test.create({ code, name, createdBy, format, hasEssay, items });
}

export function findTestByCode(code) {
  return Test.findOne({ code: String(code).trim() });
}

export function countSubmissions(testId) {
  return Submission.countDocuments({ test: testId });
}

// O'quvchi javob kiritayotgan holatlar (bot/student.js)
const ANSWERING_STATES = ['st_answer', 'st_essay', 'st_confirm'];

/** Testga javob kiritishni boshlagan, lekin hali yubormagan o'quvchilar soni */
export function countAnswering(testId) {
  return User.countDocuments({ state: { $in: ANSWERING_STATES }, 'stateData.testId': String(testId) });
}

export class SubmitError extends Error {}

/**
 * @param {{ essay?: number|null, essaySkipped?: boolean }} [essayInfo] esse bali (0–75) — faqat esseli testda
 */
export async function submitAnswers(test, user, answers, { essay = null, essaySkipped = false } = {}) {
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
      essay: fresh.hasEssay ? (essay ?? 0) : null,
      essaySkipped: fresh.hasEssay ? essaySkipped || essay === null : false,
    });
  } catch (err) {
    if (err?.code === 11000) throw new SubmitError('Siz bu testga allaqachon javob yuborgansiz.');
    throw err;
  }
}

/** Rasch bo'yicha hisoblab, natijalarni Submission va Test hujjatlariga yozadi (test.save() ham) */
async function computeAndStore(test) {
  const submissions = await Submission.find({ test: test._id }).sort({ createdAt: 1 });
  const essays = test.hasEssay ? submissions.map((s) => s.essay ?? 0) : null;
  const result = computeResults(
    submissions.map((s) => s.correct),
    { essays },
  );

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
              totalScore: p.total,
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
    item.keyShift = null;
  });
  // Surilgan kalit — eng aniq ogohlantirish, boshqa izohlar o'rniga ko'rsatiladi
  for (const { index, neighbor, matches } of detectKeyShift(test.items, submissions.map((s) => s.answers))) {
    test.items[index].keyShift = test.items[neighbor].label;
    test.items[index].flag = keyShiftFlag(test.items[neighbor], matches);
  }
  test.stats = result.stats;
  await test.save();

  const ranked = await Submission.find({ test: test._id }).sort({ rank: 1, createdAt: 1 });
  return { test, submissions: ranked };
}

/**
 * Testni yopadi va Rasch bo'yicha hisoblaydi. Natijalar hali qatnashchilarga yuborilmaydi —
 * admin tekshirib, publishTest() ni chaqirishi kerak. Qatnashchi bo'lmasa, test darhol
 * yakunlanadi: tekshiradigan va yuboradigan natija yo'q.
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
    const result = await computeAndStore(test);
    if (!result.submissions.length) {
      test.publishedAt = test.closedAt;
      await test.save();
    }
    return result;
  } catch (err) {
    await Test.updateOne({ _id: test._id }, { $set: { status: 'open' } });
    throw err;
  }
}

/**
 * Yopilgan testda kalitni tuzatish: barcha javoblar qayta tekshiriladi va Rasch qayta hisoblanadi.
 * Natijalar yuborilgan bo'lsa, test yana «yuborishni kutmoqda» holatiga qaytadi: admin tekshirib
 * tasdiqlagach, o'quvchilarga tuzatilgan natija «qayta hisoblandi» deb yuboriladi.
 * @param {Map<string, string[]>} fixes savol nomi → yangi kalit(lar)
 */
export async function fixKeys(testId, fixes) {
  const test = await Test.findOne({ _id: testId, status: 'closed' });
  if (!test) return null;
  for (const item of test.items) if (fixes.has(item.label)) item.key = fixes.get(item.label);
  test.markModified('items');
  if (test.publishedAt) {
    test.publishedAt = null;
    test.revision = (test.revision || 0) + 1;
  }

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

/** Natijalari hech qachon yuborilmagan testni qayta ochish (yana javob qabul qiladi) */
export async function reopenTest(testId) {
  const test = await Test.findOneAndUpdate(
    { _id: testId, status: 'closed', publishedAt: null, revision: { $not: { $gt: 0 } } },
    { $set: { status: 'open', closedAt: null } },
    { returnDocument: 'after' },
  );
  if (test) {
    await Submission.updateMany(
      { test: test._id },
      {
        $set: { theta: null, se: null, tScore: null, totalScore: null, grade: null, rank: null, infit: null, outfit: null },
      },
    );
  }
  return test;
}

/** Natijalarni e'lon qilish. null — test yopilmagan yoki allaqachon e'lon qilingan */
export async function publishTest(testId) {
  // Kalit tuzatilgandan keyin — tuzatilgan natija hammaga qaytadan yuboriladi
  // (belgilar e'londan oldin tozalanadi: bot to'xtab qolsa, qayta ishga tushganda davom etadi)
  const pending = await Test.findOne({ _id: testId, status: 'closed', publishedAt: null });
  if (pending?.revision) {
    await Submission.updateMany({ test: pending._id }, { $set: { notified: false, notifyAttempts: 0 } });
  }
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
        const wrong = [...optionLetters(itemOptions(item))].filter((l) => l !== item.key[0]);
        return wrong[Math.floor(Math.random() * wrong.length)];
      }
      return ok ? item.key[0] : 'xato';
    });
    const correct = checkAnswers(test.items, answers);
    const n = existing + k + 1;
    // Esse bali qobiliyat bilan bog'liq: o'rtacha ~55, [0; 75]
    const essay = test.hasEssay ? Math.min(ESSAY_MAX, Math.max(0, Math.round((55 + 10 * theta + 5 * gauss()) * 2) / 2)) : null;
    docs.push({
      test: test._id,
      userId: -n,
      fullName: `Sinov o'quvchi ${n}`,
      answers,
      correct,
      rawScore: correct.reduce((a, b) => a + b, 0),
      essay,
      simulated: true,
    });
  }
  await Submission.insertMany(docs);
  return docs.length;
}
