import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

/**
 * Hosting sozlamalariga qo'lda qo'yilgan qiymat: chetidagi bo'sh joy, yangi qator va qo'shtirnoq
 * olib tashlanadi (.env da dotenv buni o'zi qiladi, Vercel/Render panelida esa qolib ketishi mumkin)
 */
export function cleanEnv(value) {
  return String(value ?? '')
    .trim()
    .replace(/^(['"])(.*)\1$/s, '$2')
    .trim();
}

const botToken = cleanEnv(process.env.BOT_TOKEN);

export const config = {
  botToken,
  mongoUri: cleanEnv(process.env.MONGODB_URI),
  mongoDb: cleanEnv(process.env.MONGODB_DB) || 'rasch_bot',
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n !== 0),
  enableSimulate: process.env.ENABLE_SIMULATE === 'true',
  // Webhook rejimi: WEBHOOK_URL yoki Render avtomatik beradigan RENDER_EXTERNAL_URL bo'lsa yoqiladi
  webhookUrl: (process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  // Telegram secret_token: faqat A-Z, a-z, 0-9, _ va - (Render generateValue base64 beradi).
  // Berilmasa, tokendan hosil qilinadi — Vercel funksiyasi va webhook o'rnatish skripti bir xil oladi
  webhookSecret:
    cleanEnv(process.env.WEBHOOK_SECRET).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 256) ||
    crypto.createHash('sha256').update(`rasch-webhook:${botToken}`).digest('hex'),
  port: Number(process.env.PORT) || 10000,
};

export function isAdmin(telegramId) {
  return config.adminIds.includes(telegramId);
}

export function validateConfig() {
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (missing.length) {
    throw new Error(`.env faylida quyidagilar ko'rsatilmagan: ${missing.join(', ')}`);
  }
  if (!config.adminIds.length) {
    console.warn('⚠️  ADMIN_IDS bo\'sh — hech kim test yarata olmaydi. Botga /id yuborib ID ni bilib oling.');
  }
}
