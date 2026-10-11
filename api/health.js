// Vercel funksiyasi: GET /api/health — sozlamalar, bazaga ulanish va bot tokenini tekshirish
// (maxfiy qiymatlarsiz: token o'rniga botning ommaviy username'i ko'rsatiladi)
import mongoose from 'mongoose';
import { Api } from 'grammy';
import { config } from '../src/config.js';
import { ensureDb } from '../src/serverless.js';

export default {
  async fetch() {
    const missing = ['BOT_TOKEN', 'MONGODB_URI'].filter((key) => !process.env[key]);
    if (missing.length) return Response.json({ ok: false, missing }, { status: 500 });
    const result = { ok: true, admins: config.adminIds.length };
    try {
      await ensureDb();
      await mongoose.connection.db.admin().ping();
      result.db = config.mongoDb;
    } catch (err) {
      Object.assign(result, { ok: false, db: String(err?.message || err) });
    }
    try {
      result.bot = `@${(await new Api(config.botToken).getMe()).username}`;
    } catch (err) {
      Object.assign(result, { ok: false, bot: `token ishlamadi: ${err?.description || err?.message}` });
    }
    return Response.json(result, { status: result.ok ? 200 : 500 });
  },
};
