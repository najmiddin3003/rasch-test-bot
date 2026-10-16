import { InlineKeyboard, Keyboard } from 'grammy';
import { optionLetters } from '../lib/formats.js';

export const BTN = {
  takeTest: '📝 Test topshirish',
  myResults: '📊 Natijalarim',
  changeName: "✏️ Ismni o'zgartirish",
  newTest: '➕ Yangi test',
  tests: '📋 Testlar',
  help: '❓ Yordam',
  cancel: '❌ Bekor qilish',
};

export function mainMenu(isAdmin) {
  const kb = new Keyboard();
  if (isAdmin) kb.text(BTN.newTest).text(BTN.tests).row();
  kb.text(BTN.takeTest).text(BTN.myResults).row();
  kb.text(BTN.changeName).text(BTN.help);
  return kb.resized();
}

export const cancelMenu = new Keyboard().text(BTN.cancel).resized();

export const newTestConfirmKb = new InlineKeyboard()
  .text('✅ Saqlash', 'nt:save')
  .text('❌ Bekor qilish', 'nt:cancel');

export const noClosedKb = new InlineKeyboard().text("Yopiq savol yo'q", 'nt:noclosed');
export const noOpenKb = new InlineKeyboard().text("Ochiq savol yo'q", 'nt:noopen');
export const openKeyBackKb = new InlineKeyboard().text('↩️ Oldingi savolni qayta yozish', 'nt:back');

export const formatKb = new InlineKeyboard()
  .text('📘 Ona tili (Milliy sertifikat)', 'nt:fmt:ona_tili')
  .row()
  .text('⚙️ Erkin format', 'nt:fmt:free');

export const optionsCountKb = new InlineKeyboard()
  .text('4 ta (A–D)', 'nt:opt:4')
  .text('5 ta (A–E)', 'nt:opt:5')
  .text('6 ta (A–F)', 'nt:opt:6')
  .row()
  .text("Yopiq savol yo'q", 'nt:noclosed');

export const essayChoiceKb = new InlineKeyboard().text('✅ Esse bor', 'nt:essay:1').text("❌ Esse yo'q", 'nt:essay:0');

/** Yopiq savol: variant tugmalari (4–5 ta bitta qatorda, 6 ta ikki qatorda) va «O'tkazish» */
export function closedAnswerKb(pos, options) {
  const letters = optionLetters(options);
  const kb = new InlineKeyboard();
  const perRow = letters.length > 5 ? 3 : letters.length;
  [...letters].forEach((l, i) => {
    kb.text(l.toUpperCase(), `q:${pos}:${l}`);
    if ((i + 1) % perRow === 0) kb.row();
  });
  return kb.row().text("⏭ O'tkazish", `q:${pos}:s`);
}

export function openSkipKb(pos) {
  return new InlineKeyboard().text("⏭ O'tkazish", `o:${pos}:s`);
}

export const essaySkipKb = new InlineKeyboard().text("⏭ O'tkazish (esse 0 ball)", 'e:s');

export const submitConfirmKb = new InlineKeyboard()
  .text('✅ Tasdiqlash', 'sub:confirm')
  .text('🔄 Boshidan kiritish', 'sub:retry');

/** @param {number} listPage «⬅️ Testlar» qaytaradigan ro'yxat sahifasi */
export function testCardKb(test, participants, listPage = 0) {
  const id = test._id.toString();
  const kb = new InlineKeyboard();
  if (test.status === 'open') kb.text('🔒 Yopish va hisoblash', `t:close:${id}`).row();
  if (test.status === 'closed' && !test.publishedAt) {
    kb.text('📤 Natijalarni yuborish', `t:publish:${id}`).row();
    kb.text('✏️ Kalitni tuzatish', `t:fix:${id}`);
    // Natijalari bir marta yuborilgan testga yangi javob qabul qilinmaydi
    if (!test.revision) kb.text('🔓 Qayta ochish', `t:reopen:${id}`);
    kb.row();
  }
  if (test.status === 'closed' && participants) {
    if (test.publishedAt) kb.text('✏️ Kalitni tuzatish', `t:fix:${id}`);
    kb.text('📥 Excel hisobot', `t:report:${id}`).row();
  }
  kb.text('🔑 Kalit', `t:key:${id}`).text("🗑 O'chirish", `t:del:${id}`).row();
  kb.text('⬅️ Testlar', `t:list:${listPage}`);
  return kb;
}

export function confirmKb(action, id) {
  return new InlineKeyboard().text('✅ Ha', `t:${action}ok:${id}`).text("❌ Yo'q", `t:view:${id}`);
}
