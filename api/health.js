// Vercel funksiyasi: GET /api/health — sozlamalar va bazaga ulanishni tekshirish (maxfiy qiymatlarsiz)
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { ensureDb } from '../src/serverless.js';

export default {
  async fetch() {
    const missing = ['BOT_TOKEN', 'MONGODB_URI'].filter((key) => !process.env[key]);
    if (missing.length) return Response.json({ ok: false, missing }, { status: 500 });
    try {
      await ensureDb();
      await mongoose.connection.db.admin().ping();
      return Response.json({ ok: true, db: config.mongoDb, admins: config.adminIds.length });
    } catch (err) {
      return Response.json({ ok: false, db: String(err?.message || err) }, { status: 500 });
    }
  },
};
