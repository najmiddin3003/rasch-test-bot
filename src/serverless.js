// Serverless (Vercel) rejimi: Telegram webhook so'rovini qabul qilib, botga uzatish.
// Telegram max_connections: 1 bilan yangilanishlarni ketma-ket yuboradi; har biri to'liq qayta
// ishlangach javob qaytariladi. Natijalarni yuborish kabi uzoq ishlar fonda (waitUntil) davom etadi.
import { BotError } from 'grammy';
import mongoose from 'mongoose';
import { config, validateConfig } from './config.js';
import { connectDb } from './db.js';
import { createBot } from './bot/index.js';
import { MAX_NOTIFY_ATTEMPTS, startNotify } from './bot/admin.js';
import { runInBackground } from './lib/background.js';
import { pendingNotifications, recoverStuckTests } from './services/testService.js';

// Bir nechta nusxa parallel ishlashi mumkin: boshqa nusxa hozir bajarayotgan ishga tegmaslik uchun
// faqat shundan eski "osilib qolgan" holatlar tiklanadi (funksiya 60 soniyadan ko'p ishlamaydi)
const STALE_MS = 3 * 60 * 1000;

let dbReady = null;
let botReady = null;

/** Baza ulanishi — nusxa ichida qayta ishlatiladi */
export function ensureDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  dbReady ??= connectDb(config.mongoUri, config.mongoDb).catch((err) => {
    dbReady = null;
    throw err;
  });
  return dbReady;
}

/** Sovuq ishga tushishda bir marta: baza va bot */
export function getBot() {
  botReady ??= (async () => {
    validateConfig();
    await ensureDb();
    const bot = createBot(config.botToken, {}, { cacheUsers: false });
    await bot.init();
    return bot;
  })().catch((err) => {
    botReady = null;
    throw err;
  });
  return botReady;
}

/** Osilib qolgan testlar va yuborilmay qolgan natijalar (funksiya vaqti tugab qolgan bo'lsa) */
async function recover(bot) {
  await recoverStuckTests({ olderThanMs: STALE_MS });
  for (const { test, submissions } of await pendingNotifications(MAX_NOTIFY_ATTEMPTS, { publishedBeforeMs: STALE_MS })) {
    startNotify(bot.api, test, submissions, test.createdBy);
  }
}

/**
 * @param {{
 *   getBot: () => Promise<import('grammy').Bot>,
 *   secretToken: string,
 *   onFirstUpdate?: (bot: import('grammy').Bot) => Promise<void>,
 * }} deps onFirstUpdate — nusxa ishga tushgach bir marta, fonda (sukut bo'yicha: tiklash)
 * @returns {(request: Request) => Promise<Response>}
 */
export function createTelegramHandler({ getBot: loadBot, secretToken, onFirstUpdate = recover }) {
  let started = false;
  return async function handle(request) {
    if (request.method !== 'POST') return new Response('ok');
    if (request.headers.get('x-telegram-bot-api-secret-token') !== secretToken) {
      return new Response('unauthorized', { status: 401 });
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('bad request', { status: 400 });
    }
    const bot = await loadBot();
    if (!started) {
      started = true;
      runInBackground(onFirstUpdate(bot).catch((err) => console.error('Tiklash:', err)));
    }
    try {
      await bot.handleUpdate(update);
    } catch (err) {
      // Xatolik foydalanuvchiga aytiladi; 200 qaytariladi — aks holda Telegram shu xabarni qayta-qayta yuboradi
      if (!(err instanceof BotError)) throw err;
      await bot.errorHandler(err);
    }
    return new Response('ok');
  };
}
