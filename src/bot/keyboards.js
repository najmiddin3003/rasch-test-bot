import { InlineKeyboard, Keyboard } from 'grammy';

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

export const submitConfirmKb = new InlineKeyboard()
  .text('✅ Tasdiqlash', 'sub:confirm')
  .text('🔄 Qayta kiritish', 'sub:retry');

export function testCardKb(test) {
  const id = test._id.toString();
  const kb = new InlineKeyboard();
  if (test.status === 'open') kb.text('🔒 Yopish va hisoblash', `t:close:${id}`).row();
  if (test.status === 'closed' && !test.publishedAt) {
    kb.text('📤 Natijalarni yuborish', `t:publish:${id}`).row();
    kb.text('✏️ Kalitni tuzatish', `t:fix:${id}`).text('🔓 Qayta ochish', `t:reopen:${id}`).row();
  }
  if (test.status === 'closed') kb.text('📥 Excel hisobot', `t:report:${id}`).row();
  kb.text('🔑 Kalit', `t:key:${id}`).text("🗑 O'chirish", `t:del:${id}`).row();
  kb.text('⬅️ Testlar', 't:list:0');
  return kb;
}

export function confirmKb(action, id) {
  return new InlineKeyboard().text('✅ Ha', `t:${action}ok:${id}`).text("❌ Yo'q", `t:view:${id}`);
}
