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
const sent = [];
let updateId = 1;

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

function callback(userId, data) {
  return bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: from(userId),
      chat_instance: '1',
      data,
      message: {
        message_id: 1,
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

  const { createBot } = await import('../src/bot/index.js');
  bot = createBot('123:TEST', { botInfo: BOT_INFO });
  bot.api.config.use(async (_prev, method, payload) => {
    // Haqiqiy Telegram kabi: HTML rejimida noma'lum teg yoki qochirilmagan "<" — xato
    if (payload?.parse_mode === 'HTML' && typeof payload.text === 'string') {
      const stripped = payload.text.replace(/<\/?(b|i|u|s|code|pre|a)(\s[^>]*)?>/g, '');
      if (stripped.includes('<') || /&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(stripped)) {
        sent.push({ method, payload, rejected: true });
        return { ok: false, error_code: 400, description: "Bad Request: can't parse entities" };
      }
    }
    sent.push({ method, payload });
    if (method.startsWith('send') || method === 'editMessageText') {
      return {
        ok: true,
        result: { message_id: sent.length, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text },
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

test("to'liq oqim: test yaratish → javoblar → yopish → Rasch natijalari", { skip, timeout: 600000 }, async () => {
  // --- Admin ro'yxatdan o'tadi va test yaratadi
  await message(ADMIN, '/start');
  assert.match(lastText(ADMIN), /Ism-familiyangizni/);
  await message(ADMIN, 'Admin Testov');
  assert.match(lastText(ADMIN), /Assalomu alaykum/);

  await message(ADMIN, '➕ Yangi test');
  await message(ADMIN, 'Matematika sinov');
  await message(ADMIN, 'abcdzz');
  assert.match(lastText(ADMIN), /Noto'g'ri belgilar/);
  await message(ADMIN, '1a2b3c4d5a6b7c8d9a10b');
  assert.match(lastText(ADMIN), /Ochiq savollar kalitini/);
  await message(ADMIN, '11a=12\n11b=-3\n12=0.5;1/2');
  assert.match(lastText(ADMIN), /Jami savollar: <b>13<\/b>/);
  await callback(ADMIN, 'nt:save');

  const created = await models.Test.findOne({ name: 'Matematika sinov' });
  assert.ok(created, 'test bazaga saqlanishi kerak');
  assert.equal(created.items.length, 13);
  assert.deepEqual(created.items[12].key, ['0.5', '1/2']);
  assert.ok(textsTo(ADMIN).some((t) => t.includes(`?start=${created.code}`)));

  // --- O'quvchi bo'lmagan foydalanuvchi admin tugmasidan foydalana olmaydi
  await message(5000, '/start');
  await message(5000, 'Begona Odam');
  await message(5000, '📋 Testlar');
  assert.match(lastText(5000), /faqat adminlar/);

  // --- 30 ta o'quvchi bir vaqtda javob yuboradi (qobiliyati bo'yicha har xil)
  const key = 'abcdabcdab';
  const students = Array.from({ length: 30 }, (_, k) => 2001 + k);
  await Promise.all(students.map(async (id, k) => {
    const correctClosed = Math.round((k / 29) * 10); // 0..10 ta to'g'ri
    const closed = [...key].map((l, i) => (i < correctClosed ? l : l === 'a' ? 'b' : 'a')).join('');
    await message(id, `/start ${created.code}`);
    await message(id, `O'quvchi ${k + 1}`);
    assert.match(lastText(id), /Yopiq savollar: <b>1–10<\/b>/);
    if (k === 0) {
      await message(id, 'abc');
      assert.match(lastText(id), /10 ta javob kerak/);
    }
    await message(id, closed);
    assert.match(lastText(id), /Ochiq savollar: <b>11a, 11b, 12<\/b>/);
    const strong = k >= 15;
    await message(id, strong ? '12\n−3\n0,5' : k % 2 ? '12\n-\n3' : '1\n2\n3');
    assert.match(lastText(id), /Javoblaringizni tekshiring/);
    await callback(id, 'sub:confirm');
    assert.match(lastText(id), /qabul qilindi/);
  }));

  // Takroriy urinish rad etiladi
  await message(2001, created.code);
  assert.match(lastText(2001), /allaqachon|javob yuborgansiz/);

  const subs = await models.Submission.find({ test: created._id });
  assert.equal(subs.length, 30);
  const strongSub = subs.find((s) => s.userId === 2030);
  assert.equal(strongSub.rawScore, 13, "eng kuchli o'quvchi hammasini to'g'ri topgan");

  // HTML maxsus belgilarli noto'g'ri javob — xato xabari qochirilgan holda keladi (audit topilmasi)
  await message(5000, `/start ${created.code}`);
  await message(5000, '1a 2b <3c & 4d');
  assert.match(lastText(5000), /&lt;/);
  await message(5000, '/cancel');

  // --- Admin testni yopadi: natijalar faqat adminga ko'rsatiladi
  await callback(ADMIN, `t:closeok:${created._id}`);
  let closed = await models.Test.findById(created._id);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.publishedAt, null);
  assert.equal(closed.stats.participants, 30);
  // Bu testdagi javoblar ataylab "zinapoya" (Guttman) shaklida — sof CML yechimi yo'q, prior ishlatiladi
  assert.equal(closed.stats.method, 'CML+prior');
  assert.ok(closed.stats.converged);
  assert.ok(sent.some((s) => s.method === 'sendDocument' && s.payload.chat_id === ADMIN), 'Excel hisobot yuboriladi');
  assert.ok(textsTo(ADMIN).some((t) => t.includes('yuborilmadi')));
  assert.equal(await models.Submission.countDocuments({ test: created._id, notified: true }), 0);
  assert.match(lastText(2030), /qabul qilindi/, "e'londan oldin o'quvchiga natija bormaydi");
  await message(2030, '📊 Natijalarim');
  assert.match(lastText(2030), /e'lon qilinmagan/);

  // --- Kalitni tuzatish: 10-savol "a" deb o'zgartiriladi → to'g'ri yechganlar ballari kamayadi
  await callback(ADMIN, `t:fix:${created._id}`);
  assert.match(lastText(ADMIN), /Kalitni tuzatish/);
  await message(ADMIN, '10=a');
  closed = await models.Test.findById(created._id);
  assert.deepEqual(closed.items[9].key, ['a']);
  assert.equal((await models.Submission.findOne({ test: created._id, userId: 2030 })).rawScore, 12);
  // ...va qaytariladi
  await callback(ADMIN, `t:fix:${created._id}`);
  await message(ADMIN, '10=b');
  assert.equal((await models.Submission.findOne({ test: created._id, userId: 2030 })).rawScore, 13);

  // --- Qayta ochish: yangi qatnashchi qo'shiladi, keyin yana yopiladi
  await callback(ADMIN, `t:reopen:${created._id}`);
  assert.equal((await models.Test.findById(created._id)).status, 'open');
  await message(3001, `/start ${created.code}`);
  await message(3001, 'Kechikkan Talaba');
  await message(3001, '1a2b3c4d5a6b7c8d9a10b');
  await message(3001, '12\n-3\n1/2');
  await callback(3001, 'sub:confirm');
  assert.match(lastText(3001), /qabul qilindi/);
  await callback(ADMIN, `t:closeok:${created._id}`);
  assert.equal((await models.Test.findById(created._id)).stats.participants, 31);

  // --- E'lon qilish: endi natijalar fonda yuboriladi
  await callback(ADMIN, `t:publish:${created._id}`);
  assert.match(lastText(ADMIN), /yuborilsinmi/);
  await callback(ADMIN, `t:publishok:${created._id}`);
  for (let i = 0; i < 150; i++) {
    if ((await models.Submission.countDocuments({ test: created._id, notified: true })) === 31) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const ranked = await models.Submission.find({ test: created._id }).sort({ rank: 1 });
  assert.ok(ranked.every((s) => s.notified && s.tScore !== null && s.rank >= 1));
  assert.ok(ranked.every((s) => s.tScore <= 75), 'maksimal ball 75');
  // Ko'proq to'g'ri javob — yuqoriroq T-ball; bir xil ball — bir xil T
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].rawScore >= ranked[i].rawScore);
    if (ranked[i - 1].rawScore === ranked[i].rawScore) assert.equal(ranked[i - 1].tScore, ranked[i].tScore);
  }
  const top = await models.Submission.findOne({ test: created._id, userId: 2030 });
  assert.equal(top.rank, 1);
  assert.match(lastText(2030), /Rasch bali \(T\)/);
  assert.match(lastText(2030), /O'rin: 1\/31/);
  await message(2030, '📊 Natijalarim');
  assert.match(lastText(2030), /ball, A/);

  // E'londan keyin kalitni tuzatib bo'lmaydi
  await callback(ADMIN, `t:fix:${created._id}`);
  assert.notEqual((await models.User.findOne({ telegramId: ADMIN })).state, 'fix_key');

  // Yopilgan testga javob qabul qilinmaydi
  await message(5000, created.code);
  assert.match(lastText(5000), /yopilgan/);

  // Telegram rad etgan xabar va kutilmagan xatolik bo'lmagan
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
  assert.ok(!sent.some((s) => String(s.payload.text).includes('Kutilmagan xatolik')));
});
