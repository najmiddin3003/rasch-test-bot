// Vercel rejimi: webhook so'rovini qabul qilish (secret token, xatolar) va fondagi ishlar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotError } from 'grammy';
import { createTelegramHandler } from '../src/serverless.js';
import { runInBackground, setBackgroundRunner } from '../src/lib/background.js';

const SECRET = 'test_secret-123';

function fakeBot(handleUpdate) {
  const bot = {
    updates: [],
    errors: [],
    async handleUpdate(update) {
      bot.updates.push(update);
      await handleUpdate?.(update);
    },
    async errorHandler(err) {
      bot.errors.push(err);
    },
  };
  return bot;
}

const post = (body, secret = SECRET) =>
  new Request('https://bot.example/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret && { 'x-telegram-bot-api-secret-token': secret }) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test("webhook: secret token tekshiriladi, yangilanish botga beriladi, ishga tushish ishi bir marta", async () => {
  const bot = fakeBot();
  let started = 0;
  const handle = createTelegramHandler({ getBot: async () => bot, secretToken: SECRET, onFirstUpdate: async () => started++ });

  assert.equal((await handle(new Request('https://bot.example/api/telegram'))).status, 200);
  assert.equal((await handle(post({ update_id: 1 }, null))).status, 401);
  assert.equal((await handle(post({ update_id: 1 }, 'boshqa'))).status, 401);
  assert.equal(bot.updates.length, 0, "secret tokensiz so'rov botga yetmaydi");

  assert.equal((await handle(post({ update_id: 7 }))).status, 200);
  assert.equal((await handle(post({ update_id: 8 }))).status, 200);
  assert.deepEqual(bot.updates.map((u) => u.update_id), [7, 8]);
  assert.equal(started, 1);
  assert.equal((await handle(post('{buzilgan'))).status, 400);
});

test("webhook: bot xatosi foydalanuvchiga aytiladi va 200 qaytadi (Telegram qayta yubormaydi)", async () => {
  const bot = fakeBot(() => {
    throw new BotError(new Error('kutilmagan'), { update: {} });
  });
  const handle = createTelegramHandler({ getBot: async () => bot, secretToken: SECRET, onFirstUpdate: async () => {} });
  assert.equal((await handle(post({ update_id: 1 }))).status, 200);
  assert.equal(bot.errors.length, 1);

  // Bazaga ulanib bo'lmasa kabi xatolar — 500 (Telegram keyinroq qayta yuboradi)
  const broken = createTelegramHandler({
    getBot: async () => {
      throw new Error('MongoDB ulanmadi');
    },
    secretToken: SECRET,
  });
  await assert.rejects(() => broken(post({ update_id: 2 })), /MongoDB ulanmadi/);
});

test('fondagi ishlar waitUntil ga topshiriladi', async () => {
  const registered = [];
  setBackgroundRunner((p) => registered.push(p));
  const p = Promise.resolve(42);
  assert.equal(runInBackground(p), p);
  assert.deepEqual(registered, [p]);
  setBackgroundRunner(null);
  assert.equal(await runInBackground(Promise.resolve(1)), 1);
});
