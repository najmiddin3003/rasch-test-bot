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
];
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
  assert.match(lastText(ADMIN), /14 ta savol[\s\S]*36-savol<\/b> kaliti \(1\/14\)/);
  // Yozma kalit bittalab: hammasi bitta xabarda — rad etiladi
  await message(ADMIN, OPEN_KEY.join('\n'));
  assert.match(lastText(ADMIN), /alohida xabarda/);
  // ",,;" — vergul yoki nuqtali vergul; xato bo'lsa «Oldingi savolni qayta yozish»
  await message(ADMIN, ',,;');
  assert.match(lastText(ADMIN), /36-savol: <code>,<\/code> yoki <code>;<\/code>[\s\S]*37-savol<\/b> kaliti \(2\/14\)/);
  await callback(ADMIN, 'nt:back');
  assert.match(lastText(ADMIN), /36-savol kaliti \(<code>,<\/code> yoki <code>;<\/code>\) o'chirildi[\s\S]*\(1\/14\)/);
  // Savol tashlab ketilsa — keyingi savol raqami bilan yozilgan javob qabul qilinmaydi
  await message(ADMIN, OPEN_KEY[1]);
  assert.match(lastText(ADMIN), /36-savol kaliti so'ralmoqda, siz esa 37-savol uchun/);
  for (const line of OPEN_KEY.slice(0, -1)) await message(ADMIN, line);
  // Oxirgi kalit «;» bilan (eski odat) — ko'rib chiqishda ogohlantiriladi va qayta yozish mumkin
  await message(ADMIN, '44b=.;!');
  assert.match(lastText(ADMIN), /Esse:<\/b> bor[\s\S]*⚠️ <b>44b<\/b>: «;» va «\|» ajratuvchi emas/);
  await callback(ADMIN, 'nt:editopen');
  assert.match(lastText(ADMIN), /44-savol \(b\) kaliti \(<code>\.;!<\/code>\) o'chirildi[\s\S]*\(14\/14\)/);
  // Juda uzun kalit ham qayta so'raladi (xabar qisqartiriladi, Telegram rad etmaydi)
  await message(ADMIN, `44b=${'a'.repeat(4050)}`);
  await callback(ADMIN, 'nt:editopen');
  assert.match(lastText(ADMIN), /<code>a{59}…<\/code>\) o'chirildi[\s\S]*\(14\/14\)/);
  await message(ADMIN, OPEN_KEY.at(-1));
  assert.match(lastText(ADMIN), /Esse:<\/b> bor/);
  assert.doesNotMatch(lastText(ADMIN), /ajratuvchi emas/);
  await callback(ADMIN, 'nt:save');

  const created = await models.Test.findOne({ name: 'Ona tili sinov' });
  assert.ok(created, 'test bazaga saqlanishi kerak');
  assert.equal(created.format, 'ona_tili');
  assert.equal(created.hasEssay, true);
  assert.equal(created.items.length, 49);
  assert.deepEqual(created.items.slice(0, 35).map((i) => i.options), [...Array(32).fill(4), 6, 6, 6]);
  assert.deepEqual(created.items.slice(35).map((i) => i.label), ['36', '37', '38', '39', '40a', '40b', '41a', '41b', '42a', '42b', '43a', '43b', '44a', '44b']);
  assert.deepEqual(created.items.slice(35).map((i) => i.key), OPEN_KEY.map((l) => [l.split('=')[1]]), "0,5 — o'nli kasr");

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
      // 36 o'tkazilgan xabar 37 javobi bilan tahrirlanganda «o'tkazildi» izohi saqlanadi
      const edited37 = sent.find(
        (s) => s.method === 'editMessageText' && s.payload.chat_id === B && /37-savol<\/b>: <code>-<\/code>/.test(s.payload.text),
      );
      assert.ok(edited37, '37-savol javobi tahriri');
      assert.match(edited37.payload.text, /36-savol: o'tkazildi/);
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
      // Yozma javoblar bitta xabarda bir nechta qator: har biri navbatdagi savolga (37= belgisi olib tashlanadi)
      await message(D, 'xato\n' + 'a\n'.repeat(20));
      assert.match(lastText(D), /21 ta qator bor, lekin 14 ta yozma savol qoldi/);
      await message(D, 'xato\n37=tire\nxato');
      assert.match(lastText(D), /39-savol<\/b> — javobingizni yozing/);
      await answerOpen(D, 38, ['xato', 'ot', 'xato', 'xato', 'xato', '7', 'xato', 'xato', 'xato', 'xato', 'xato']);
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
  assert.deepEqual(subD.answers.slice(35, 39), ['xato', 'tire', 'xato', 'xato'], "ko'p qatorli xabar savollarga bo'linadi");
  assert.equal(subD.correct[36], 1, '37: tire');

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
  await message(ADMIN, '6=0.5;1/2');
  await callback(ADMIN, 'nt:essay:0');
  assert.match(lastText(ADMIN), /⚠️ <b>6<\/b>: «;» va «\|» ajratuvchi emas/);
  const stalePreview = findButtonMessage(ADMIN, 'nt:editopen');
  await callback(ADMIN, 'nt:editopen');
  assert.match(lastText(ADMIN), /Yozma savollar kalitini<\/b> yuboring/);
  await message(ADMIN, '6=Toshkent');
  await callback(ADMIN, 'nt:essay:0');
  assert.match(lastText(ADMIN), /Esse:<\/b> yo'q/);
  // Eski ko'rib chiqishdagi «↩️» tugmasi yangi kalitni o'chirmaydi
  await callback(ADMIN, 'nt:editopen', stalePreview);
  assert.equal((await userState(ADMIN)).state, 'nt_confirm');
  assert.deepEqual((await userState(ADMIN)).stateData.openItems, [{ label: '6', key: ['Toshkent'] }]);
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

test("Ishtirokchisiz test: yopilganda hech kimga xabar yuborilmaydi", { skip, timeout: 300000 }, async () => {
  const t = await services.createTest({ name: "Bo'sh test", createdBy: ADMIN, closedKey: ['a', 'b'], closedOptions: [4, 4], openItems: [] });
  // O'quvchi javob kiritishni boshlagan, lekin yubormagan — yopishdan oldin admin ogohlantiriladi
  const F = 4001;
  await message(F, `/start ${t.code}`);
  await message(F, "O'quvchi F");
  await callback(ADMIN, `t:close:${t._id}`);
  assert.match(lastText(ADMIN), /Hali hech kim javob yubormagan/);
  assert.match(lastText(ADMIN), /1 ta o'quvchi javob kiritishni boshlagan/);

  const start = sent.length;
  await callback(ADMIN, `t:closeok:${t._id}`);
  const messages = sent.slice(start).filter((s) => s.method.startsWith('send') || s.method.startsWith('edit'));
  const closed = await models.Test.findById(t._id);
  assert.equal(closed.status, 'closed');
  assert.ok(closed.publishedAt, "natija yuborish bosqichi bo'lmaydi — test darhol yakunlanadi");
  assert.ok(messages.every((s) => s.payload.chat_id === ADMIN), 'admindan boshqa hech kimga xabar yuborilmaydi');
  assert.ok(!messages.some((s) => s.method === 'sendDocument'), 'Excel yuborilmaydi');
  assert.ok(!messages.some((s) => /hisoblandi/.test(s.payload.text)), 'xulosa yuborilmaydi');
  assert.equal(lastText(ADMIN), '🔒 Ishtirokchilar mavjud emas — test yopildi.');
  const card = messages.find((s) => s.payload.reply_markup?.inline_keyboard);
  assert.match(card.payload.text, /Yopilgan .*ishtirokchilar bo'lmagan/);
  assert.deepEqual(
    card.payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data.split(':')[1]),
    ['key', 'del', 'list'],
    "yuborish, tuzatish va Excel tugmalari yo'q",
  );

  // O'quvchi davom etsa — test yopilgani aytiladi
  await callback(F, 'q:0:a');
  assert.match(lastText(F), /Test yopilgan/);
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
});

test("Testlar ro'yxati: faol testlar yuqorida, tugaganlari 5 tadan, «Oldingi» / «Keyingi»", { skip, timeout: 300000 }, async () => {
  // Oldingi testlarnikidan tashqari yana 11 ta tugagan test (har xil vaqtda yopilgan)
  const base = Date.now() - 3600000;
  await models.Test.insertMany(
    Array.from({ length: 11 }, (_, k) => ({
      code: String(900000 + k),
      name: `Eski test ${k + 1}`,
      createdBy: ADMIN,
      items: [{ label: '1', kind: 'closed', options: 4, key: ['a'] }],
      status: 'closed',
      closedAt: new Date(base + k * 60000),
      publishedAt: new Date(base + k * 60000),
    })),
  );
  const finished = await models.Test.find({ status: 'closed' }).sort({ closedAt: -1, _id: -1 });
  const pages = Math.ceil(finished.length / 5);
  assert.ok(pages >= 3);

  const buttons = () =>
    sent.findLast((s) => s.payload.chat_id === ADMIN && s.payload.reply_markup?.inline_keyboard).payload.reply_markup.inline_keyboard.flat();
  const expectPage = (page, active = []) => {
    const shown = buttons()
      .filter((b) => b.callback_data.startsWith('t:view:'))
      .map((b) => b.callback_data.slice('t:view:'.length));
    const expected = [...active, ...finished.slice(page * 5, page * 5 + 5)].map((t) => t._id.toString());
    assert.deepEqual(shown, expected, `${page + 1}-sahifa`);
    const nav = buttons()
      .filter((b) => b.callback_data.startsWith('t:list:'))
      .map((b) => b.text);
    assert.deepEqual(nav, [...(page > 0 ? ['⬅️ Oldingi'] : []), `${page + 1}/${pages}`, ...(page < pages - 1 ? ['Keyingi ➡️'] : [])]);
  };

  await message(ADMIN, '📋 Testlar');
  assert.match(lastText(ADMIN), /Faol testlar: yo'q/);
  expectPage(0);

  // Faol test har bir sahifada yuqorida, tugaganlari baribir 5 tadan
  const active = await services.createTest({ name: 'Faol test', createdBy: ADMIN, closedKey: ['a'], closedOptions: [4], openItems: [] });
  await message(ADMIN, '📋 Testlar');
  assert.match(lastText(ADMIN), /Faol testlar: 1 ta/);
  assert.match(lastText(ADMIN), new RegExp(`Tugagan testlar: ${finished.length} ta \\(1–5\\)`));
  expectPage(0, [active]);
  await callback(ADMIN, 't:list:1');
  expectPage(1, [active]);
  assert.match(lastText(ADMIN), /\(6–10\)/);
  await callback(ADMIN, `t:list:${pages - 1}`);
  expectPage(pages - 1, [active]);
  await callback(ADMIN, 't:list:999');
  expectPage(pages - 1, [active]);

  // 2-sahifadagi test ochilib, «⬅️ Testlar» bosilsa — yana 2-sahifaga qaytadi
  await callback(ADMIN, 't:list:1');
  await callback(ADMIN, `t:view:${finished[6]._id}`);
  const back = buttons().find((b) => b.text === '⬅️ Testlar');
  assert.equal(back.callback_data, 't:list:1');
  await callback(ADMIN, back.callback_data);
  expectPage(1, [active]);
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
});

const lastButtons = (chatId) =>
  sent
    .findLast((s) => s.payload.chat_id === chatId && s.payload.reply_markup?.inline_keyboard)
    .payload.reply_markup.inline_keyboard.flat()
    .map((b) => b.callback_data);

/** Natijalar yuborilib, adminga «📨 #kod: ... yuborildi» xabari kelguncha (round — shu testda nechanchi yuborish) */
async function waitNotified(t, count, round = 1) {
  const done = () => textsTo(ADMIN).filter((x) => x.startsWith(`📨 #${t.code}:`) && x.includes('yuborildi —')).length;
  for (let i = 0; i < 150; i++) {
    if (done() >= round && (await models.Submission.countDocuments({ test: t._id, notified: true })) === count) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('natijalar yuborilmadi');
}

test("Natija yuborilgandan keyin: surilgan kalit aniqlanadi, tuzatiladi va natija qayta yuboriladi", { skip, timeout: 300000 }, async () => {
  // O'qituvchi yozma kalitni kiritishda 4-qatorga ortiqcha javob yozgan va «besh» ni tushirib qoldirgan
  const truth = ['bir', 'ikki', 'uch', "to'rt", 'besh', 'olti'];
  const typed = ['bir', 'x', 'ikki', 'uch', "to'rt", 'olti'];
  const t = await services.createTest({
    name: 'Surilgan kalit',
    createdBy: ADMIN,
    closedKey: ['a', 'b'],
    closedOptions: [4, 4],
    openItems: typed.map((key, i) => ({ label: String(i + 3), key: [key] })),
  });
  const ids = Array.from({ length: 8 }, (_, k) => 5001 + k);
  for (const [k, id] of ids.entries()) {
    const openAnswers = truth.map((a, j) => ((k + j) % 4 === 0 ? 'xato' : a));
    await services.submitAnswers(t, { telegramId: id, fullName: `O'quvchi ${k + 1}`, username: null }, ['a', k % 2 ? 'b' : 'c', ...openAnswers]);
  }

  // Yopilganda bot surilgan qatorni ko'rsatadi
  await callback(ADMIN, `t:closeok:${t._id}`);
  let doc = await models.Test.findById(t._id);
  assert.deepEqual(doc.items.filter((i) => i.keyShift).map((i) => `${i.label}→${i.keyShift}`), ['4→5', '5→6', '6→7']);
  assert.ok(textsTo(ADMIN).some((x) => x.includes("Kalit surilganga o'xshaydi</b> (4, 5, 6)")));
  await callback(ADMIN, `t:publish:${t._id}`);
  assert.match(lastText(ADMIN), /Kalit surilganga o'xshaydi \(4, 5, 6\)/);

  // Admin baribir yuboradi — o'quvchilar xato natija oladi
  await callback(ADMIN, `t:publishok:${t._id}`);
  await waitNotified(t, 8);
  const old = await models.Submission.findOne({ test: t._id, userId: ids[1] });
  assert.doesNotMatch(lastText(ids[1]), /qayta hisoblandi/);

  // Natija yuborilgan testda ham «Kalitni tuzatish» bor va bot taklif beradi
  await callback(ADMIN, `t:view:${t._id}`);
  assert.ok(lastButtons(ADMIN).includes(`t:fix:${t._id}`));
  await callback(ADMIN, `t:fix:${t._id}`);
  assert.match(lastText(ADMIN), /Natijalar o'quvchilarga yuborilgan/);
  assert.match(lastText(ADMIN), /Bot taklifi[\s\S]*<code>4=ikki\n5=uch\n6=to'rt<\/code>/);
  await message(ADMIN, "4=ikki\n5=uch\n6=to'rt\n7=besh");

  doc = await models.Test.findById(t._id);
  assert.equal(doc.publishedAt, null, 'test yana «yuborishni kutmoqda» holatida');
  assert.equal(doc.revision, 1);
  assert.equal(doc.items.filter((i) => i.keyShift).length, 0);
  assert.ok(textsTo(ADMIN).some((x) => x.includes('Kalit tuzatildi, natijalar qayta hisoblandi')));
  const card = lastButtons(ADMIN);
  assert.ok(card.includes(`t:publish:${t._id}`));
  assert.ok(!card.includes(`t:reopen:${t._id}`), 'natijasi yuborilgan testni qayta ochib bo\'lmaydi');
  await callback(ADMIN, `t:reopen:${t._id}`, 1);
  assert.equal((await models.Test.findById(t._id)).status, 'closed');

  // Qayta yuborish: hamma tuzatilgan natijani «qayta hisoblandi» deb oladi
  await callback(ADMIN, `t:publish:${t._id}`);
  assert.match(lastText(ADMIN), /tuzatilgan natijalari barcha qatnashchilarga «qayta hisoblandi» deb yuborilsinmi/);
  await callback(ADMIN, `t:publishok:${t._id}`);
  await waitNotified(t, 8, 2);
  const fixed = await models.Submission.findOne({ test: t._id, userId: ids[1] });
  assert.ok(fixed.rawScore > old.rawScore, `${old.rawScore} → ${fixed.rawScore}`);
  assert.match(lastText(ids[1]), /Natijangiz qayta hisoblandi/);
  assert.match(lastText(ids[1]), new RegExp(`To'g'ri javoblar: <b>${fixed.rawScore}/8</b>`));
  assert.ok(textsTo(ADMIN).some((x) => x.includes('tuzatilgan natijalar yuborildi — 8 ta')));
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
});

test("Yozma javoblar raqami bilan: boshqa savolga yozilib qolmaydi, tashlab ketilgan savol qayta so'raladi", { skip, timeout: 300000 }, async () => {
  const t = await services.createTest({
    name: 'Raqamli javoblar',
    createdBy: ADMIN,
    closedKey: ['a'],
    closedOptions: [4],
    openItems: ['ikki', 'uch', "to'rt", 'besh'].map((key, i) => ({ label: String(i + 2), key: [key] })),
  });
  const G = 6001;
  await message(G, `/start ${t.code}`);
  await message(G, "O'quvchi G");
  await callback(G, 'q:0:a');
  assert.match(lastText(G), /<b>2-savol<\/b> — javobingizni yozing/);

  // 2-savolda turib 3-savol javobini raqami bilan yozdi — 3 ga yoziladi, 2 qayta so'raladi
  await message(G, '3=uch');
  assert.ok(textsTo(G).some((x) => x.includes('<b>3-savol</b>: <code>uch</code>')));
  assert.match(lastText(G), /<b>2-savol<\/b> — javobingizni yozing/);

  // Raqamsiz qatorlar — navbatdagi javobsiz savollarga (javob berilgan 3 o'tkazib yuboriladi)
  await message(G, "ikki\nto'rt");
  assert.match(lastText(G), /<b>5-savol<\/b> — javobingizni yozing/);

  // Oldingi javobni raqami bilan tuzatish — joriy savol o'zgarmaydi
  await message(G, '2=IKKI');
  assert.match(lastText(G), /<b>5-savol<\/b> — javobingizni yozing/);
  await callback(G, 'o:4:s');
  assert.match(lastText(G), /Javoblaringizni tekshiring/);
  await callback(G, 'sub:confirm');

  const sub = await models.Submission.findOne({ test: t._id, userId: G });
  assert.deepEqual(sub.answers, ['a', 'IKKI', 'uch', "to'rt", '']);
  assert.deepEqual(sub.correct, [1, 1, 1, 1, 0]);
  assert.deepEqual(sent.filter((s) => s.rejected).map((s) => s.payload.text), []);
});

test("Natija yuborish: ikki parallel yuboruvchi bir o'quvchiga ikki marta yubormaydi, kalit tuzatilsa eski natija ketmaydi", { skip, timeout: 300000 }, async () => {
  const { notifyParticipants } = await import('../src/bot/admin.js');
  const t = await services.createTest({ name: 'Parallel', createdBy: ADMIN, closedKey: ['a', 'b'], closedOptions: [4, 4], openItems: [] });
  const ids = Array.from({ length: 6 }, (_, k) => 7001 + k);
  for (const [k, id] of ids.entries()) {
    await services.submitAnswers(t, { telegramId: id, fullName: `P${k}`, username: null }, ['a', k % 2 ? 'b' : 'c']);
  }
  await services.closeTest(t._id);

  const calls = [];
  let blocked = ids[5];
  const api = {
    async sendMessage(chatId, text) {
      if (chatId === blocked) throw new Error('Forbidden: bot was blocked by the user');
      calls.push({ chatId, text });
      await new Promise((r) => setTimeout(r, 5));
    },
  };
  const published = await services.publishTest(t._id);
  const [a, b] = await Promise.all([
    notifyParticipants(api, published.test, published.submissions),
    notifyParticipants(api, published.test, published.submissions),
  ]);
  assert.equal(calls.length, 5, 'har bir o\'quvchiga bir marta');
  assert.equal(new Set(calls.map((c) => c.chatId)).size, 5);
  assert.equal(a.sent + b.sent, 5);
  const failedSub = await models.Submission.findOne({ test: t._id, userId: ids[5] });
  assert.equal(failedSub.notified, false);
  assert.ok(a.failed + b.failed >= 1);
  assert.equal(failedSub.notifyAttempts, a.failed + b.failed);
  assert.equal(failedSub.notifyClaimedAt, null, "yuborilmagan xabar band qilinmay qoladi — keyin qayta urinish mumkin");

  // O'quvchi botni blokdan chiqardi — qayta tiklash yuborilmay qolganini yuboradi
  blocked = null;
  const [pending] = (await services.pendingNotifications(3)).filter((p) => p.test._id.equals(t._id));
  assert.deepEqual(pending.submissions.map((s) => s.userId), [ids[5]]);
  await notifyParticipants(api, pending.test, pending.submissions);
  assert.equal(calls.filter((c) => c.chatId === ids[5]).length, 1);

  // Kalit tuzatildi — eski e'lon bo'yicha yuborish to'xtaydi; qayta e'lon qilinganda hamma tuzatilganini oladi
  await services.fixKeys(t._id, new Map([['2', ['c']]]));
  const stale = await notifyParticipants(api, published.test, published.submissions.map((s) => Object.assign(s, { notified: false })));
  assert.deepEqual(stale, { sent: 0, failed: 0 });
  const republished = await services.publishTest(t._id);
  calls.length = 0;
  await notifyParticipants(api, republished.test, republished.submissions);
  assert.equal(calls.length, 6);
  assert.ok(calls.every((c) => /qayta hisoblandi/.test(c.text)));
});
