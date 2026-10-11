// Vercel funksiyasi: Telegram webhook (POST /api/telegram, secret token bilan himoyalangan)
import { waitUntil } from '@vercel/functions';
import { config } from '../src/config.js';
import { setBackgroundRunner } from '../src/lib/background.js';
import { createTelegramHandler, getBot } from '../src/serverless.js';

setBackgroundRunner(waitUntil);

export default {
  fetch: createTelegramHandler({ getBot, secretToken: config.webhookSecret }),
};
