import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { User } from '../models/User.js';
import { isAdmin } from '../config.js';
import { escapeHtml } from '../lib/format.js';
import { BTN, cancelMenu } from './keyboards.js';
import { HTML, askName, help, welcome } from './texts.js';
import { replyWithMenu, resetState, setState } from './helpers.js';
import { beginTest, handleStudentText, registerStudent, showMyResults } from './student.js';
import { handleAdminText, registerAdmin } from './admin.js';

export const ALLOWED_UPDATES = ['message', 'callback_query'];

export const BOT_COMMANDS = [
  { command: 'start', description: 'Boshlash / menyu' },
  { command: 'help', description: 'Yordam' },
  { command: 'cancel', description: 'Joriy amalni bekor qilish' },
  { command: 'id', description: 'Telegram ID ni ko\'rish' },
];

const USER_CACHE_TTL = 10 * 60 * 1000;
const USER_CACHE_MAX = 5000;

async function askForName(ctx, pendingCode = null) {
  await setState(ctx, 'await_name', pendingCode ? { pendingCode } : {});
  return ctx.reply(askName, { ...HTML, reply_markup: { remove_keyboard: true } });
}

/**
 * @param {string} token
 * @param {import('grammy').BotConfig} [botConfig] testlarda botInfo berish uchun
 * @param {{ cacheUsers?: boolean }} [options] cacheUsers: false — bir nechta nusxa ishlaganda (Vercel)
 */
export function createBot(token, botConfig = {}, { cacheUsers = true } = {}) {
  const bot = new Bot(token, botConfig);
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

  // Foydalanuvchi hujjatlari keshi: har xabarda bazaga murojaat qilmaslik uchun.
  // Bot bitta jarayonda ishlasa (Render, kompyuter), User faqat shu yerdan o'zgaradi va kesh eskirmaydi.
  // Serverless'da so'rovlar turli nusxalarga tushadi — kesh eskirishi mumkin, shuning uchun o'chiriladi.
  const userCache = new Map();
  const loadUser = async (from) => {
    const username = from.username ?? null;
    const firstName = from.first_name ?? null;
    const cached = cacheUsers ? userCache.get(from.id) : null;
    if (cached && Date.now() - cached.at < USER_CACHE_TTL) {
      if (cached.doc.username !== username || cached.doc.firstName !== firstName) {
        cached.doc.set({ username, firstName });
        await cached.doc.save();
      }
      return cached.doc;
    }
    const doc = await User.findOneAndUpdate(
      { telegramId: from.id },
      { $set: { username, firstName } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    if (cacheUsers) {
      userCache.delete(from.id);
      userCache.set(from.id, { doc, at: Date.now() });
      if (userCache.size > USER_CACHE_MAX) userCache.delete(userCache.keys().next().value);
    }
    return doc;
  };

  // Faqat shaxsiy chatlar
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    if (ctx.chat && ctx.chat.type !== 'private') return;
    ctx.user = await loadUser(ctx.from);
    ctx.isAdmin = isAdmin(ctx.from.id);
    await next();
  });

  bot.command('start', async (ctx) => {
    const payload = ctx.match?.trim() || null;
    if (!ctx.user.fullName) return askForName(ctx, payload);
    await resetState(ctx);
    if (payload) return beginTest(ctx, payload);
    return replyWithMenu(ctx, welcome(ctx.user.fullName));
  });

  bot.command('id', (ctx) => ctx.reply(`Sizning Telegram ID: <code>${ctx.from.id}</code>`, HTML));

  bot.command('help', (ctx) => replyWithMenu(ctx, help(ctx.isAdmin)));
  bot.hears(BTN.help, (ctx) => replyWithMenu(ctx, help(ctx.isAdmin)));

  const cancel = async (ctx) => {
    await resetState(ctx);
    if (!ctx.user.fullName) return askForName(ctx);
    return replyWithMenu(ctx, 'Bekor qilindi. Asosiy menyu:');
  };
  bot.command('cancel', cancel);
  bot.hears(BTN.cancel, cancel);

  bot.hears(BTN.changeName, (ctx) => askForName(ctx));

  // Ism kiritilmagan bo'lsa, boshqa amallarga o'tkazmaymiz
  bot.use(async (ctx, next) => {
    if (ctx.user.fullName || ctx.user.state === 'await_name') return next();
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    return askForName(ctx);
  });

  bot.hears(BTN.takeTest, async (ctx) => {
    await setState(ctx, 'await_code');
    return ctx.reply('Test kodini yuboring (masalan: <code>12345</code>):', { ...HTML, reply_markup: cancelMenu });
  });

  bot.hears(BTN.myResults, async (ctx) => {
    await resetState(ctx);
    return showMyResults(ctx);
  });

  registerAdmin(bot);
  registerStudent(bot);

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;

    if (ctx.user.state === 'await_name') {
      const name = text.trim().replace(/\s+/g, ' ');
      if (name.startsWith('/') || name.length < 3 || name.length > 64 || !/\p{L}/u.test(name)) {
        return ctx.reply("❗ Ism-familiyani to'g'ri kiriting (3–64 belgi).");
      }
      const pendingCode = ctx.user.stateData?.pendingCode;
      ctx.user.fullName = name;
      await setState(ctx, null, {});
      if (!pendingCode) return replyWithMenu(ctx, welcome(name));
      await replyWithMenu(ctx, `✅ Saqlandi: <b>${escapeHtml(name)}</b>`);
      return beginTest(ctx, pendingCode);
    }

    if (await handleAdminText(ctx, text)) return;
    if (await handleStudentText(ctx, text)) return;

    return replyWithMenu(ctx, 'Test topshirish uchun <b>test kodini</b> yuboring yoki menyudan foydalaning.');
  });

  bot.on('message', (ctx) => ctx.reply('Iltimos, matn ko\'rinishida yuboring.'));

  bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery({ text: "Bu tugma eskirgan." }));

  bot.catch(async (err) => {
    console.error(`Xatolik (update ${err.ctx?.update?.update_id}):`, err.error);
    try {
      if (err.ctx?.callbackQuery) await err.ctx.answerCallbackQuery().catch(() => {});
      await err.ctx?.reply('⚠️ Kutilmagan xatolik yuz berdi. Qaytadan urinib ko\'ring yoki /cancel bosing.');
    } catch {
      // javob yuborib bo'lmasa — e'tiborsiz
    }
  });

  return bot;
}
