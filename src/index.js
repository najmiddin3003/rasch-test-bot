import crypto from 'node:crypto';
import { config, validateConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createBot, BOT_COMMANDS } from './bot/index.js';
import { MAX_NOTIFY_ATTEMPTS, startNotify } from './bot/admin.js';
import { createWebhookServer, WEBHOOK_PATH } from './server.js';
import { pendingNotifications, recoverStuckTests } from './services/testService.js';

const ALLOWED_UPDATES = ['message', 'callback_query'];

async function main() {
  validateConfig();

  await connectDb(config.mongoUri, config.mongoDb);
  console.log(`✅ MongoDB ga ulandi (${config.mongoDb})`);

  const recovered = await recoverStuckTests();
  if (recovered) console.log(`↩️  ${recovered} ta test "yopilmoqda" holatidan tiklandi`);

  const bot = createBot(config.botToken);
  await bot.init();
  await bot.api.setMyCommands(BOT_COMMANDS);

  // Natija yuborish jarayonida bot to'xtagan bo'lsa — qolganlarini yuborish
  for (const { test, submissions } of await pendingNotifications(MAX_NOTIFY_ATTEMPTS)) {
    console.log(`📨 #${test.code}: ${submissions.length} ta yuborilmagan natija qayta yuborilmoqda`);
    startNotify(bot.api, test, submissions, test.createdBy);
  }

  if (config.webhookUrl) {
    // Webhook rejimi (Render): Telegram har bir yangilanishni HTTP so'rov qilib yuboradi.
    // Bepul tarifda server uxlab qolsa, Telegram so'rovi uni uyg'otadi.
    const secretToken = config.webhookSecret || crypto.randomBytes(24).toString('hex');
    const server = createWebhookServer(bot, { secretToken });
    await new Promise((resolve) => server.listen(config.port, resolve));
    await bot.api.setWebhook(`${config.webhookUrl}${WEBHOOK_PATH}`, {
      secret_token: secretToken,
      allowed_updates: ALLOWED_UPDATES,
      // Bir vaqtda bitta yangilanish — long polling kabi ketma-ket ishlov (poyga holatlarisiz)
      max_connections: 1,
    });

    const shutdown = async (signal) => {
      // Webhook o'chirilmaydi: bepul tarifda server uxlaganda ham Telegram uni uyg'otishi kerak
      console.log(`${signal} — to'xtatilmoqda...`);
      server.close();
      await disconnectDb();
      process.exit(0);
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    console.log(
      `🤖 @${bot.botInfo.username} webhook rejimida: ${config.webhookUrl}${WEBHOOK_PATH} (port ${config.port}). ` +
        `Adminlar: ${config.adminIds.join(', ') || "yo'q"}`,
    );
    return;
  }

  // Lokal ishga tushirish — long polling (webhook bo'lsa, grammY uni o'chiradi)
  const shutdown = async (signal) => {
    console.log(`${signal} — to'xtatilmoqda...`);
    await bot.stop();
    await disconnectDb();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  console.log(`🤖 @${bot.botInfo.username} ishga tushdi (long polling). Adminlar: ${config.adminIds.join(', ') || "yo'q"}`);
  await bot.start({ allowed_updates: ALLOWED_UPDATES });
}

main().catch((err) => {
  console.error('❌ Ishga tushirishda xatolik:', err.message);
  process.exit(1);
});
