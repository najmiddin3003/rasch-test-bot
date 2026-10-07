// To'liq oqim testi: soxta Telegram API + haqiqiy MongoDB (alohida test bazasi).
// Ishga tushirish: .env da MONGODB_URI bo'lsa `npm test` o'zi ishlatadi
// (yoki TEST_MONGODB_URI). Test oxirida "rasch_bot_flowtest" bazasi o'chiriladi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const uri = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
const TEST_DB = 'rasch_bot_flowtest';
const ADMIN = 1000;

process.env.ADMIN_IDS = String(ADMIN);

const skip = !uri && 'MONGODB_URI berilmagan — oqim testi o\'tkazib yuborildi';

let bot;
let mongoose;
let models;
let services;
let gradeFor;
const sent = [];
let updateId = 1;
let messageCounter = 1000;

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'Rasch Test',
  username: 'rasch_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

function from(id) {
  return { id, is_bot: false, first_name: `U${id}` };
}

function message(userId, text) {
  const isCommand = text.startsWith('/');
  return bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private', first_name: `U${userId}` },
      from: from(userId),
      text,
      ...(isCommand && { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] }),
    },
  });
}

/** Shu chatdagi oxirgi xabar(lar) ichidan berilgan tugmani topadi (xabar ID si bilan) */
function findButtonMessage(chatId, data) {
  for (let i = sent.length - 1; i >= 0; i--) {
    const s = sent[i];
    if (s.payload?.chat_id !== chatId || !s.payload.reply_markup?.inline_keyboard) continue;
    if (s.payload.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === data)) return s.messageId;
  }
  return null;
}

/** Tugmani bosish. messageId berilmasa — tugma turgan oxirgi xabar */
function callback(userId, data, messageId = undefined) {
  const id = messageId ?? findButtonMessage(userId, data) ?? 1;
  return bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: from(userId),
      chat_instance: '1',
      data,
      message: {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        chat: { id: userId, type: 'private' },
        from: { ...BOT_INFO },
        text: '...',
      },
    },
  });
}

const textsTo = (chatId) => sent.filter((s) => s.payload.chat_id === chatId && s.payload.text).map((s) => s.payload.text);
const lastText = (chatId) => textsTo(chatId).at(-1) ?? '';
const userState = async (id) => (await models.User.findOne({ telegramId: id })).toObject();

before(async () => {
  if (skip) return;
  mongoose = (await import('mongoose')).default;
  const { connectDb } = await import('../src/db.js');
  await connectDb(uri, TEST_DB);
  await mongoose.connection.dropDatabase();
  models = {
    Test: (await import('../src/models/Test.js')).Test,
    Submission: (await import('../src/models/Submission.js')).Submission,
    User: (await import('../src/models/User.js')).User,
  };
  await Promise.all(Object.values(models).map((m) => m.init()));
  services = await import('../src/services/testService.js');
  ({ gradeFor } = await import('../src/lib/scoring.js'));

  const { createBot } = await import('../src/bot/index.js');
  bot = createBot('123:TEST', { botInfo: BOT_INFO });
  bot.api.config.use(async (_prev, method, payload) => {
    // Haqiqiy Telegram kabi: HTML rejimida noma'lum teg yoki qochirilmagan "<" — xato
    if (payload?.parse_mode === 'HTML' && typeof payload.text === 'string') {
      const stripped = payload.text.replace(/<\/?(b|i|u|s|code|pre|a)(\s[^>]*)?>/g, '');
      if (stripped.includes('<') || /&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(stripped) || payload.text.length > 4096) {
        sent.push({ method, payload, rejected: true });
        return { ok: false, error_code: 400, description: "Bad Request: can't parse entities" };
      }
    }
    const messageId = method.startsWith('send') ? ++messageCounter : payload?.message_id;
    sent.push({ method, payload, messageId });
    if (method.startsWith('send') || method === 'editMessageText') {
      return {
        ok: true,
        result: { message_id: messageId, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text },
      };
    }
    return { ok: true, result: true };
  });
});

after(async () => {
  if (skip) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// Ona tili shabloni: 1–32 A–D, 33–35 A–F
const CLOSED_KEY = [...Array(32)].map((_, i) => 'abcd'[(i * 3) % 4]).concat(['e', 'f', 'b']);
const OPEN_KEY = [
  "36=o'g'il",
  '37=—',
  '38=tutuq belgisi',
  '39=12',
  '40a=ot',
  '40b=kesim',
  '41a=ega',
  '41b=aniqlovchi',
  '42a=7',
  '42b=0,5',
  '43a=Navoiy',
  '43b=Bobur',
  '44a=ʼ',
  '44b=.',
].join('\n');
// Hammasi to'g'ri, lekin tutuq/tire/kasr/nuqta boshqacha yozilgan
const OPEN_ALL_RIGHT = ['o‘g‘il', 'tire', '`', '12', 'Ot', 'kesim', 'ega', 'aniqlovchi', '7', '1/2', 'navoiy', 'Bobur.', 'tutuq belgisi', 'nuqta'];

/** Yopiq savollarni tugmalar bilan yechish: letters[i] — '' bo'lsa «O'tkazish» */
async function answerClosedByButtons(userId, letters) {
  for (let pos = 0; pos < letters.length; pos++) {
    await callback(userId, `q:${pos}:${letters[pos] || 's'}`);
  }
}

/** Yozma savollar: '' bo'lsa «O'tkazish», aks holda matn */
async function answerOpen(userId, firstPos, answers) {
  for (let k = 0; k < answers.length; k++) {
    if (answers[k]) await message(userId, answers[k]);
    else await callback(userId, `o:${firstPos + k}:s`);
  }
}

test("Ona tili (Milliy sertifikat): tugmalar, bittalab yozish, esse, tuzatish, yopish va e'lon", { skip, timeout: 900000 }, async () => {
  // --- Admin ro'yxatdan o'tadi va shablon bo'yicha test yaratadi
  await message(ADMIN, '/start');
  await message(ADMIN, 'Admin Testov');
  await message(ADMIN, '➕ Yangi test');
  await message(ADMIN, 'Ona tili sinov');
  assert.match(lastText(ADMIN), /formatini/);
  await callback(ADMIN, 'nt:fmt:ona_tili');
  assert.match(lastText(ADMIN), /35 ta harf \(1–32: A–D, 33–35: A–F\)/);
  // 1-savolga E — variantdan tashqari, rad etiladi
  await message(ADMIN, 'e' + CLOSED_KEY.slice(1).join(''));
  assert.match(lastText(ADMIN), /1-savolda faqat A–D/);
  await message(ADMIN, CLOSED_KEY.join(''));
  assert.match(lastText(ADMIN), /14 ta javob/);
  await message(ADMIN, OPEN_KEY);
  assert.match(lastText(ADMIN), /Esse:<\/b> bor/);
  await callback(ADMIN, 'nt:save');

  const created = await models.Test.findOne({ name: 'Ona tili sinov' });
  assert.ok(created, 'test bazaga saqlanishi kerak');
  assert.equal(created.format, 'ona_tili');
  assert.equal(created.hasEssay, true);
  assert.equal(created.items.length, 49);
  assert.deepEqual(created.items.slice(0, 35).map((i) => i.options), [...Array(32).fill(4), 6, 6, 6]);
  assert.deepEqual(created.items.slice(35).map((i) => i.label), ['36', '37', '38', '39', '40a', '40b', '41a', '41b', '42a', '42b', '43a', '43b', '44a', '44b']);

  const code = created.code;
  const A = 2001; // hammasi tugmalar bilan, hammasi to'g'ri, esse 61,5
  const B = 2002; // yopiq — bitta matnda, ba'zilarini o'tkazadi, esseni o'tkazadi, keyin tuzatadi
  const C = 2003; // yopiq — ikki marta bosish va eski tugma sinovi, esse 75
  const D = 2004; // o'rtacha, esse 0

  await Promise.all(
    [A, B, C, D].map(async (id, k) => {
      await message(id, `/start ${code}`);
      await message(id, `O'quvchi ${k + 1}`);
    }),
  );
  assert.match(lastText(A), /yopiq savollar\n.* 1\/35/);
  assert.match(lastText(A), /1-savol<\/b> — javobni tanlang/);

  // 6 variantli savolda E/F tugmalari bor, 4 variantlida yo'q
  const firstClosedMsg = sent.findLast((s) => s.payload.chat_id === A && s.payload.reply_markup);
  const buttons = firstClosedMsg.payload.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.deepEqual(buttons, ['A', 'B', 'C', 'D', "⏭ O'tkazish"]);

  const wrongOf = (l) => (l === 'a' ? 'b' : 'a');

  await Promise.all([
    (async () => {
      await answerClosedByButtons(A, CLOSED_KEY);
      // 6 variantli savollar xabarida E va F tugmalari bo'lgan
      const six = sent.filter((s) => s.payload.chat_id === A && s.payload.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data === 'q:33:f'));
      assert.ok(six.length, '33–35-savollarda A–F tugmalari');
      assert.match(lastText(A), /36-savol<\/b> — javobingizni yozing/);
      await answerOpen(A, 35, OPEN_ALL_RIGHT);
      assert.match(lastText(A), /Esse bali/);
      await message(A, '80');
      assert.match(lastText(A), /0 dan 75 gacha/);
      await message(A, '61,5');
      assert.match(lastText(A), /Javoblaringizni tekshiring/);
      assert.match(lastText(A), /Esse:<\/b> 61\.5/);
      await callback(A, 'sub:confirm');
      assert.match(lastText(A), /qabul qilindi/);
    })(),
    (async () => {
      // Yopiq javoblar bitta matnda: 3 tasi xato, 2 tasi javobsiz
      const bulk = CLOSED_KEY.map((l, i) => (i < 3 ? wrongOf(l) : i === 10 || i === 20 ? 'x' : l));
      await message(B, bulk.map((l, i) => `${i + 1}${l}`).join(' '));
      assert.match(lastText(B), /36-savol<\/b> — javobingizni yozing/);
      // 36 o'tkaziladi, 37 — oddiy chiziqcha (tire), qolganlari aralash
      await answerOpen(B, 35, ['', '-', 'xato', '12', 'ot', 'xato', 'ega', 'xato', '7', '0.5', 'xato', 'Bobur', "'", 'xato']);
      await callback(B, 'e:s');
      assert.match(lastText(B), /Esse:<\/b> 0 \(kiritilmagan\)/);
      assert.match(lastText(B), /Javobsiz: 11, 21, 36/);
      // Tasdiqlashdan oldin tuzatish: 36 va esse
      await message(B, "36=o'g'il\nesse=40");
      assert.match(lastText(B), /Esse:<\/b> 40\.0/);
      assert.match(lastText(B), /36:<\/code> o'g'il/);
      await callback(B, 'sub:confirm');
      assert.match(lastText(B), /qabul qilindi/);
    })(),
    (async () => {
      // 1-savol: A bosiladi va xuddi shu tugma yana bosiladi (ikki marta bosish) — e'tiborga olinmaydi
      const msgId = findButtonMessage(C, 'q:0:a');
      await callback(C, 'q:0:a', msgId);
      await callback(C, 'q:0:b', msgId);
      let st = (await userState(C)).stateData;
      assert.equal(st.pos, 1);
      assert.equal(st.answers[0], 'a', 'ikkinchi bosish 1-savolni o\'zgartirmasligi kerak');
      // Boshqa (eski) xabardagi tugma ham e'tiborga olinmaydi
      await callback(C, 'q:1:c', msgId + 99999);
      st = (await userState(C)).stateData;
      assert.equal(st.pos, 1);
      const letters = CLOSED_KEY.map((l, i) => (i === 0 ? null : i % 5 === 0 ? '' : l)).slice(1);
      for (let k = 0; k < letters.length; k++) await callback(C, `q:${k + 1}:${letters[k] || 's'}`);
      await answerOpen(C, 35, OPEN_ALL_RIGHT.map((a, i) => (i % 2 ? a : '')));
      await message(C, '75');
      await callback(C, 'sub:confirm');
      assert.match(lastText(C), /qabul qilindi/);
    })(),
    (async () => {
      await answerClosedByButtons(D, CLOSED_KEY.map((l, i) => (i % 2 ? wrongOf(l) : l)));
      await answerOpen(D, 35, ['xato', 'tire', 'xato', 'xato', 'ot', 'xato', 'xato', 'xato', '7', 'xato', 'xato', 'xato', 'xato', 'xato']);
      await message(D, '0');
      await callback(D, 'sub:confirm');
    })(),
  ]);

  // --- Saqlangan javoblar
  const subA = await models.Submission.findOne({ test: created._id, userId: A });
  assert.equal(subA.rawScore, 49, "tutuq/tire/kasr/nuqtaning boshqa yozilishi ham to'g'ri hisoblanishi kerak");
  assert.equal(subA.essay, 61.5);
  assert.equal(subA.essaySkipped, false);

  const subB = await models.Submission.findOne({ test: created._id, userId: B });
  assert.equal(subB.answers[35], "o'g'il", 'tuzatilgan javob saqlanadi');
  assert.equal(subB.answers[10], '');
  assert.equal(subB.correct[36], 1, "37: oddiy '-' tire bilan teng");
  assert.equal(subB.correct[47], 1, "44a: ' tutuq belgisi bilan teng");
  assert.equal(subB.essay, 40);
  assert.equal(subB.essaySkipped, false);

  const subC = await models.Submission.findOne({ test: created._id, userId: C });
  assert.equal(subC.answers[0], 'a');
  assert.equal(subC.answers[5], '', "«O'tkazish» bosilgan savol javobsiz");
  assert.equal(subC.essay, 75);

  const subD = await models.Submission.findOne({ test: created._id, userId: D });
  assert.equal(subD.essay, 0);
  assert.equal(subD.essaySkipped, false);

  // Takroriy urinish rad etiladi
  await message(A, code);
  assert.match(lastText(A), /javob yuborgansiz/);

  // --- Rasch uchun yetarli qatnashchi: 30 ta sinov qatnashchisi (esse bilan)
  await services.simulateSubmissions(created, 30);

  // --- Yopish: umumiy ball = (test + esse) / 2, daraja va o'rin umumiy ball bo'yicha
  await callback(ADMIN, `t:closeok:${created._id}`);
  const closed = await models.Test.findById(created._id);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.stats.participants, 34);
  assert.ok(textsTo(ADMIN).some((t) => t.includes('Umumiy ball = (test bali + esse bali) / 2')));
  assert.ok(sent.some((s) => s.method === 'sendDocument' && s.payload.chat_id === ADMIN), 'Excel hisobot yuboriladi');

  const all = await models.Submission.find({ test: created._id }).sort({ rank: 1 });
  for (const s of all) {
    assert.ok(Math.abs(s.totalScore - (s.tScore + (s.essay ?? 0)) / 2) <= 0.05 + 1e-9, `${s.fullName}: umumiy ball`);
    assert.equal(s.grade, gradeFor(s.totalScore));
    assert.ok(s.tScore <= 75 && s.totalScore <= 75);
  }
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].totalScore >= all[i].totalScore, "o'rin umumiy ball bo'yicha");

  // --- E'lon qilish
  await callback(ADMIN, `t:publishok:${created._id}`);
  for (let i = 0; i < 150; i++) {
    if ((await models.Submission.countDocuments({ test: created._id, simulated: false, notified: true })) === 4) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(lastText(A), /Test bali \(Rasch\)/);
  assert.match(lastText(A), /Esse bali: <b>61\.5<\/b>/);
  assert.match(lastText(A), /Umumiy ball/);
  assert.match(lastText(D), /Esse bali: <b>0\.0<\/b>/);

  // Telegram rad etgan xabar va kutilmagan xatolik bo'lmagan
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
  assert.ok(!sent.some((s) => String(s.payload.text).includes('Kutilmagan xatolik')));
});

test('Erkin format: 5 variantli tugmalar, essesiz', { skip, timeout: 300000 }, async () => {
  await message(ADMIN, '➕ Yangi test');
  await message(ADMIN, 'Erkin sinov');
  await callback(ADMIN, 'nt:fmt:free');
  await callback(ADMIN, 'nt:opt:5');
  await message(ADMIN, 'abcde');
  await message(ADMIN, '6=Toshkent');
  await callback(ADMIN, 'nt:essay:0');
  assert.match(lastText(ADMIN), /Esse:<\/b> yo'q/);
  await callback(ADMIN, 'nt:save');
  const t = await models.Test.findOne({ name: 'Erkin sinov' });
  assert.equal(t.format, 'free');
  assert.equal(t.hasEssay, false);
  assert.deepEqual(t.items.map((i) => i.options), [5, 5, 5, 5, 5, null]);

  const E = 3001;
  await message(E, `/start ${t.code}`);
  await message(E, "O'quvchi E");
  const btns = sent.findLast((s) => s.payload.chat_id === E && s.payload.reply_markup).payload.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.deepEqual(btns, ['A', 'B', 'C', 'D', 'E', "⏭ O'tkazish"]);
  await answerClosedByButtons(E, ['a', 'b', 'c', 'd', 'e']);
  await message(E, 'toshkent');
  assert.match(lastText(E), /Javoblaringizni tekshiring/);
  assert.doesNotMatch(lastText(E), /Esse/);
  await callback(E, 'sub:confirm');

  await callback(ADMIN, `t:closeok:${t._id}`);
  const sub = await models.Submission.findOne({ test: t._id, userId: E });
  assert.equal(sub.rawScore, 6);
  assert.equal(sub.essay, null);
  assert.equal(sub.totalScore, sub.tScore, "essesiz testda umumiy ball — T-ball");
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
});
