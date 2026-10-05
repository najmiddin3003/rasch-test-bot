// Webhook serveri: secret token tekshiruvi, health endpoint va yangilanishni botga uzatish.
// Haqiqiy MongoDB kerak (alohida test bazasi, oxirida o'chiriladi); Telegram API soxta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const uri = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
const skip = !uri && "MONGODB_URI berilmagan — webhook testi o'tkazib yuborildi";
const TEST_DB = 'rasch_bot_webhooktest';
const SECRET = 'test_secret-123';

let mongoose;
let server;
let base;
const sent = [];

before(async () => {
  if (skip) return;
  mongoose = (await import('mongoose')).default;
  const { connectDb } = await import('../src/db.js');
  await connectDb(uri, TEST_DB);
  await mongoose.connection.dropDatabase();
  const { createBot } = await import('../src/bot/index.js');
  const { createWebhookServer } = await import('../src/server.js');
  const bot = createBot('123:TEST', {
    botInfo: { id: 1, is_bot: true, first_name: 'T', username: 'rasch_test_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false },
  });
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload });
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' } } };
  });
  server = createWebhookServer(bot, { secretToken: SECRET });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const update = (text) => ({
  update_id: 1,
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 777, type: 'private', first_name: 'W' },
    from: { id: 777, is_bot: false, first_name: 'W' },
    text,
    entities: [{ type: 'bot_command', offset: 0, length: text.length }],
  },
});

test('webhook: health, secret token va yangilanishni qayta ishlash', { skip, timeout: 60000 }, async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');

  const post = (secret) =>
    fetch(`${base}/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret && { 'x-telegram-bot-api-secret-token': secret }) },
      body: JSON.stringify(update('/id')),
    });

  assert.equal((await post('notogri')).status, 401, "noto'g'ri secret rad etiladi");
  assert.equal((await post(null)).status, 401, 'secret siz rad etiladi');
  assert.equal(sent.length, 0);

  assert.equal((await post(SECRET)).status, 200);
  const reply = sent.find((s) => s.method === 'sendMessage');
  assert.ok(reply, 'bot javob berishi kerak');
  assert.match(reply.payload.text, /777/);

  assert.equal((await fetch(`${base}/boshqa`)).status, 404);
});
