// Sozlamalar: hosting paneliga qo'lda kiritilgan qiymatlardagi bo'sh joy va qo'shtirnoq tozalanadi.
// Har bir test fayli alohida jarayonda ishlaydi — process.env ni o'zgartirish boshqa testlarga ta'sir qilmaydi.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test("sozlamalar: ADMIN_IDS, ENABLE_SIMULATE va WEBHOOK_URL qo'shtirnoq va bo'sh joydan tozalanadi", async () => {
  Object.assign(process.env, {
    BOT_TOKEN: ' "123:ABC"\n',
    MONGODB_URI: '',
    ADMIN_IDS: '"111", "222" ,333,abc',
    ENABLE_SIMULATE: ' "TRUE" ',
    WEBHOOK_URL: "'https://bot.example/' ",
    WEBHOOK_SECRET: '',
  });
  const { config, isAdmin, validateConfig } = await import('../src/config.js');
  assert.equal(config.botToken, '123:ABC');
  assert.deepEqual(config.adminIds, [111, 222, 333]);
  assert.ok(isAdmin(222));
  assert.equal(config.enableSimulate, true);
  assert.equal(config.webhookUrl, 'https://bot.example');
  assert.match(config.webhookSecret, /^[a-f0-9]{64}$/, 'secret tokendan hosil qilinadi');

  // Webhook o'rnatish skriptiga baza kerak emas
  assert.throws(() => validateConfig(), /MONGODB_URI/);
  assert.doesNotThrow(() => validateConfig({ db: false }));
});
