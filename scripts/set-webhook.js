// Telegram webhook'ni Vercel'dagi botga ulash (bir marta, joylashdan keyin):
//   node scripts/set-webhook.js https://<loyiha>.vercel.app
// BOT_TOKEN .env dan olinadi; secret token Vercel funksiyasi bilan bir xil (tokendan hosil qilinadi).
import { Api } from 'grammy';
import { config, validateConfig } from '../src/config.js';
import { ALLOWED_UPDATES, BOT_COMMANDS } from '../src/bot/index.js';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(base)) {
  console.error('Foydalanish: node scripts/set-webhook.js https://<loyiha>.vercel.app');
  process.exit(1);
}
validateConfig({ db: false });

const api = new Api(config.botToken);
await api.setWebhook(`${base}/api/telegram`, {
  secret_token: config.webhookSecret,
  allowed_updates: ALLOWED_UPDATES,
  // Bir vaqtda bitta yangilanish — ketma-ket ishlov (poyga holatlarisiz)
  max_connections: 1,
});
await api.setMyCommands(BOT_COMMANDS);
const info = await api.getWebhookInfo();
console.log(`✅ Webhook: ${info.url}`);
console.log(`   Kutib turgan xabarlar: ${info.pending_update_count}`);
