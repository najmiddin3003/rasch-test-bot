import http from 'node:http';
import { webhookCallback } from 'grammy';

export const WEBHOOK_PATH = '/telegram';

/**
 * Webhook rejimi uchun HTTP server (Render va boshqa hostinglar):
 *   POST /telegram — Telegram yangilanishlari (secret token bilan himoyalangan)
 *   GET  /health   — hosting tekshiruvi
 */
export function createWebhookServer(bot, { secretToken }) {
  const handleUpdate = webhookCallback(bot, 'http', {
    secretToken,
    // Testni yopish kabi uzoq amallarda Telegram qayta yubormasligi uchun javob oldinroq qaytariladi,
    // ishlov esa davom etadi
    timeoutMilliseconds: 25_000,
    onTimeout: 'return',
  });

  return http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (req.method === 'POST' && path === WEBHOOK_PATH) {
      handleUpdate(req, res).catch((err) => {
        console.error('Webhook xatosi:', err);
        if (!res.headersSent) res.writeHead(500).end();
      });
      return;
    }
    if (req.method === 'GET' && (path === '/health' || path === '/')) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    res.writeHead(404).end();
  });
}
