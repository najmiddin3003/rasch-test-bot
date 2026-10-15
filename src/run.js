// Ishga tushirish: kompyuterda long polling, Render'da webhook server.
// Fayl nomi ataylab index/server/app emas: Vercel bunday fayllarni server deb ishga tushiradi
// (api/ funksiyalari o'rniga) — Vercel'da bot faqat api/telegram.js orqali ishlaydi.
import { config, validateConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { ALLOWED_UPDATES, BOT_COMMANDS, createBot } from './bot/index.js';
import { MAX_NOTIFY_ATTEMPTS, startNotify } from './bot/admin.js';
import { createWebhookServer, WEBHOOK_PATH } from './webhook-server.js';
import { pendingNotifications, recoverStuckTests } from './services/testService.js';

// Yuborilmay qolgan natijalar vaqti-vaqti bilan qayta tekshiriladi: to'xtagan jarayonning band qilingan
// xabari muddati o'tgach yuboriladi, vaqtinchalik xato bilan yuborilmaganlariga qayta urinib ko'riladi
const RECOVER_EVERY_MS = 5 * 60 * 1000;

async function resumeNotifications(api) {
  for (const { test, submissions } of await pendingNotifications(MAX_NOTIFY_ATTEMPTS)) {
    console.log(`📨 #${test.code}: ${submissions.length} ta yuborilmagan natija qayta yuborilmoqda`);
    startNotify(api, test, submissions, test.createdBy, { onlyIfSent: true });
  }
}

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
  await resumeNotifications(bot.api);
  setInterval(
    () => resumeNotifications(bot.api).catch((err) => console.error('Tiklash:', err)),
    RECOVER_EVERY_MS,
  ).unref();

  if (config.webhookUrl) {
    // Webhook rejimi (Render): Telegram har bir yangilanishni HTTP so'rov qilib yuboradi.
    // Bepul tarifda server uxlab qolsa, Telegram so'rovi uni uyg'otadi.
    const secretToken = config.webhookSecret;
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
