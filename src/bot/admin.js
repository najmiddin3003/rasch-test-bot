import { InlineKeyboard, InputFile } from 'grammy';
import { Test } from '../models/Test.js';
import { Submission } from '../models/Submission.js';
import { config } from '../config.js';
import { parseClosed, parseKeyFixes, parseOpenKey } from '../lib/answers.js';
import { escapeHtml, formatClosedBlock, formatOpenBlock } from '../lib/format.js';
import { buildExcelReport } from '../lib/report.js';
import {
  closeTest,
  countSubmissions,
  createTest,
  deleteTest,
  findTestByCode,
  fixKeys,
  publishTest,
  reopenTest,
  simulateSubmissions,
} from '../services/testService.js';
import { BTN, cancelMenu, confirmKb, newTestConfirmKb, noClosedKb, noOpenKb, testCardKb } from './keyboards.js';
import { HTML, adminCloseSummary, fixKeyPrompt, keyText, studentResult, testSummary } from './texts.js';
import { replyWithMenu, resetState, safeEdit, setState, sleep } from './helpers.js';

// Telegram xabari 4096 belgidan oshmasligi uchun (ko'rib chiqish va kalit xabarlari)
const MAX_CLOSED = 150;
const MAX_OPEN = 60;
const LIST_PAGE = 10;
export const MAX_NOTIFY_ATTEMPTS = 3;

const CLOSED_KEY_PROMPT =
  '2️⃣ <b>Yopiq savollar kalitini</b> yuboring (A–F):\n' +
  '<code>abcdabcdab...</code> yoki <code>1a2b3c4d...</code>\n\n' +
  "Savollar soni kalit uzunligidan aniqlanadi. Yopiq savol bo'lmasa tugmani bosing.";

function openKeyPrompt(closedCount) {
  const next = closedCount + 1;
  return (
    `3️⃣ <b>Ochiq savollar kalitini</b> yuboring — har qatorda bitta savol:\n` +
    `<code>${next}a=12\n${next}b=-3\n${next + 1}=0.5;1/2</code>\n\n` +
    `• Bir nechta to'g'ri javob bo'lsa <code>;</code> bilan ajrating.\n` +
    `• Raqamsiz yozsangiz (faqat javoblar), ${next} dan boshlab raqamlanadi.\n` +
    `• Sonlar qiymati bo'yicha solishtiriladi: 0.5 = 1/2 = 0,5.\n\n` +
    "Ochiq savol bo'lmasa tugmani bosing."
  );
}

function newTestPreview(data) {
  const closed = data.closedKey || [];
  const open = data.openItems || [];
  let text = `📋 <b>Yangi test</b>: ${escapeHtml(data.name)}\n`;
  text += `Jami savollar: <b>${closed.length + open.length}</b> (yopiq ${closed.length}, ochiq ${open.length})\n`;
  if (closed.length) text += `\n<b>Yopiq kalit:</b>\n${formatClosedBlock(closed)}\n`;
  if (open.length) {
    text += `\n<b>Ochiq kalit:</b>\n${formatOpenBlock(
      open.map((o) => o.label),
      open.map((o) => o.key.join(' ; ')),
    )}\n`;
  }
  return text + '\nSaqlaysizmi?';
}

async function goToOpenStep(ctx, closedKey) {
  await setState(ctx, 'nt_open', { ...ctx.user.stateData, closedKey });
  return ctx.reply(openKeyPrompt(closedKey.length), { ...HTML, reply_markup: noOpenKb });
}

async function goToConfirm(ctx, openItems) {
  const data = { ...ctx.user.stateData, openItems };
  if (!data.closedKey.length && !openItems.length) {
    await setState(ctx, 'nt_closed', { name: data.name });
    return ctx.reply('❗ Testda kamida bitta savol bo\'lishi kerak.\n\n' + CLOSED_KEY_PROMPT, {
      ...HTML,
      reply_markup: noClosedKb,
    });
  }
  await setState(ctx, 'nt_confirm', data);
  return ctx.reply(newTestPreview(data), { ...HTML, reply_markup: newTestConfirmKb });
}

export async function startNewTest(ctx) {
  await setState(ctx, 'nt_name');
  return ctx.reply('1️⃣ Test <b>nomini</b> kiriting (masalan: <i>Matematika — 05.10 sinov</i>):', {
    ...HTML,
    reply_markup: cancelMenu,
  });
}

/** Admin holatlaridagi matnni qayta ishlash. true — xabar qayta ishlandi */
export async function handleAdminText(ctx, text) {
  const state = ctx.user.state;
  if (!state?.startsWith('nt_') && state !== 'fix_key') return false;
  if (!ctx.isAdmin) {
    await resetState(ctx);
    return false;
  }

  if (state === 'nt_name') {
    const name = text.trim();
    if (name.length < 2 || name.length > 100) {
      await ctx.reply('❗ Nom 2–100 belgidan iborat bo\'lsin.');
      return true;
    }
    await setState(ctx, 'nt_closed', { name });
    await ctx.reply(CLOSED_KEY_PROMPT, { ...HTML, reply_markup: noClosedKb });
    return true;
  }

  if (state === 'nt_closed') {
    const parsed = parseClosed(text);
    if (!parsed.ok) {
      await ctx.reply(`❗ ${escapeHtml(parsed.error)}\n\nQayta yuboring.`, HTML);
      return true;
    }
    if (parsed.answers.length > MAX_CLOSED) {
      await ctx.reply(`❗ Yopiq savollar ko'pi bilan ${MAX_CLOSED} ta bo'lishi mumkin (siz ${parsed.answers.length} ta yubordingiz).`);
      return true;
    }
    await goToOpenStep(ctx, parsed.answers);
    return true;
  }

  if (state === 'nt_open') {
    const parsed = parseOpenKey(text, ctx.user.stateData.closedKey.length);
    if (!parsed.ok) {
      await ctx.reply(`❗ ${escapeHtml(parsed.error)}\n\nQayta yuboring.`, HTML);
      return true;
    }
    if (parsed.items.length > MAX_OPEN) {
      await ctx.reply(`❗ Ochiq savollar ko'pi bilan ${MAX_OPEN} ta bo'lishi mumkin.`);
      return true;
    }
    await goToConfirm(ctx, parsed.items);
    return true;
  }

  if (state === 'nt_confirm') {
    await ctx.reply('Yuqoridagi «✅ Saqlash» yoki «❌ Bekor qilish» tugmasini bosing.');
    return true;
  }

  if (state === 'fix_key') {
    const test = await Test.findById(ctx.user.stateData?.testId);
    if (!test || test.status !== 'closed' || test.publishedAt) {
      await resetState(ctx);
      await replyWithMenu(ctx, 'Kalitni faqat yopilgan va natijalari hali yuborilmagan testda tuzatish mumkin.');
      return true;
    }
    const parsed = parseKeyFixes(text, test.items);
    if (!parsed.ok) {
      await ctx.reply(`❗ ${escapeHtml(parsed.error)}\n\nQayta yuboring yoki /cancel.`, HTML);
      return true;
    }
    await ctx.reply('⏳ Javoblar qayta tekshirilmoqda va Rasch qayta hisoblanmoqda...');
    const result = await fixKeys(test._id, parsed.fixes);
    await resetState(ctx);
    if (!result) {
      await replyWithMenu(ctx, "Test holati o'zgargan, kalit tuzatilmadi.");
      return true;
    }
    await replyWithMenu(ctx, `✅ Kalit tuzatildi: ${[...parsed.fixes.keys()].join(', ')}`);
    await ctx.reply(adminCloseSummary(result.test, result.submissions), HTML);
    if (result.submissions.length) await sendReport(ctx, result.test, result.submissions);
    await showTestCard(ctx, result.test, false);
    return true;
  }
  return false;
}

async function participantCounts(testIds) {
  const rows = await Submission.aggregate([
    { $match: { test: { $in: testIds } } },
    { $group: { _id: '$test', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.n]));
}

export async function showTestList(ctx, edit = false, page = 0) {
  const total = await Test.countDocuments();
  if (!total) {
    const text = "Hali test yaratilmagan. «➕ Yangi test» tugmasini bosing.";
    return edit ? safeEdit(ctx, text) : ctx.reply(text);
  }
  const pages = Math.ceil(total / LIST_PAGE);
  page = Math.min(Math.max(0, page), pages - 1);
  const tests = await Test.find()
    .sort({ createdAt: -1 })
    .skip(page * LIST_PAGE)
    .limit(LIST_PAGE);
  const counts = await participantCounts(tests.map((t) => t._id));
  const kb = new InlineKeyboard();
  for (const t of tests) {
    const icon = t.status === 'open' ? '🟢' : t.status === 'closing' ? '⏳' : t.publishedAt ? '🔴' : '🟡';
    const name = t.name.length > 28 ? `${t.name.slice(0, 27)}…` : t.name;
    kb.text(`${icon} ${name} · #${t.code} · 👥${counts.get(t._id.toString()) || 0}`, `t:view:${t._id}`).row();
  }
  if (pages > 1) {
    if (page > 0) kb.text('⬅️', `t:list:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, `t:list:${page}`);
    if (page < pages - 1) kb.text('➡️', `t:list:${page + 1}`);
  }
  const text = `📋 <b>Testlar</b> (${total} ta)\n🟢 ochiq · 🟡 yopilgan, natija yuborilmagan · 🔴 natija yuborilgan`;
  return edit ? safeEdit(ctx, text, { reply_markup: kb }) : ctx.reply(text, { ...HTML, reply_markup: kb });
}

async function showTestCard(ctx, test, edit = true) {
  const text = testSummary(test, await countSubmissions(test._id), ctx.me.username);
  const extra = { reply_markup: testCardKb(test) };
  if (edit) return safeEdit(ctx, text, extra);
  return ctx.reply(text, { ...HTML, ...extra, link_preview_options: { is_disabled: true } });
}

async function sendReport(ctx, test, submissions) {
  const buffer = await buildExcelReport(test, submissions);
  await ctx.replyWithDocument(new InputFile(buffer, `rasch_${test.code}.xlsx`), {
    caption: `📥 ${test.name} (#${test.code}) — Rasch hisoboti`,
  });
}

/** Qatnashchilarga natijalarni yuborish (Telegram limiti: ~30 xabar/sek) */
export async function notifyParticipants(api, test, submissions) {
  let sent = 0;
  let failed = 0;
  for (const sub of submissions) {
    if (sub.simulated || sub.notified) continue;
    try {
      await api.sendMessage(sub.userId, studentResult(test, sub), HTML);
      await Submission.updateOne({ _id: sub._id }, { $set: { notified: true } });
      sent++;
    } catch (err) {
      failed++;
      await Submission.updateOne({ _id: sub._id }, { $inc: { notifyAttempts: 1 } }).catch(() => {});
      console.warn(`Natija yuborilmadi (user ${sub.userId}):`, err?.description || err?.message);
    }
    await sleep(40);
  }
  return { sent, failed };
}

/** Natijalarni fonda yuborib, tugagach adminga xabar beradi (botni bloklamaydi) */
export function startNotify(api, test, submissions, adminChatId) {
  notifyParticipants(api, test, submissions)
    .then(({ sent, failed }) => {
      if (adminChatId && (sent || failed)) {
        const tail = failed ? `, yuborilmadi: ${failed} ta (botni bloklagan yoki ishga tushirmagan)` : '';
        return api.sendMessage(adminChatId, `📨 #${test.code}: natijalar yuborildi — ${sent} ta${tail}.`);
      }
    })
    .catch((err) => console.error('notifyParticipants:', err));
}

export function registerAdmin(bot) {
  const adminOnly = async (ctx, next) => {
    if (ctx.isAdmin) return next();
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: "Ruxsat yo'q" });
    return ctx.reply("⛔ Bu bo'lim faqat adminlar uchun.");
  };

  bot.hears(BTN.newTest, adminOnly, startNewTest);
  bot.hears(BTN.tests, adminOnly, async (ctx) => {
    await resetState(ctx);
    return showTestList(ctx);
  });

  bot.callbackQuery('nt:noclosed', adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.user.state !== 'nt_closed') return;
    await ctx.editMessageReplyMarkup().catch(() => {});
    return goToOpenStep(ctx, []);
  });

  bot.callbackQuery('nt:noopen', adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.user.state !== 'nt_open') return;
    await ctx.editMessageReplyMarkup().catch(() => {});
    return goToConfirm(ctx, []);
  });

  bot.callbackQuery('nt:cancel', adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    await resetState(ctx);
    return replyWithMenu(ctx, 'Bekor qilindi.');
  });

  bot.callbackQuery('nt:save', adminOnly, async (ctx) => {
    if (ctx.user.state !== 'nt_confirm') return ctx.answerCallbackQuery({ text: "Bu so'rov eskirgan." });
    const { name, closedKey, openItems } = ctx.user.stateData;
    const test = await createTest({ name, createdBy: ctx.from.id, closedKey, openItems });
    await resetState(ctx);
    await ctx.answerCallbackQuery({ text: 'Saqlandi ✅' });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await replyWithMenu(ctx, `✅ Test yaratildi! Kodni yoki havolani o'quvchilarga yuboring.`);
    return showTestCard(ctx, test, false);
  });

  bot.callbackQuery(/^t:list(?::(\d+))?$/, adminOnly, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showTestList(ctx, true, Number(ctx.match[1] || 0));
  });

  const ACTIONS = 'view|key|close|closeok|report|del|delok|publish|publishok|fix|reopen';
  bot.callbackQuery(new RegExp(`^t:(${ACTIONS}):([a-f0-9]{24})$`), adminOnly, async (ctx) => {
    const [, action, id] = ctx.match;
    const test = await Test.findById(id);
    if (!test) {
      await ctx.answerCallbackQuery({ text: 'Test topilmadi' });
      return showTestList(ctx, true);
    }
    const awaitingPublish = test.status === 'closed' && !test.publishedAt;

    switch (action) {
      case 'view':
        await ctx.answerCallbackQuery();
        return showTestCard(ctx, test);

      case 'key':
        await ctx.answerCallbackQuery();
        return ctx.reply(keyText(test), HTML);

      case 'close':
        await ctx.answerCallbackQuery();
        return safeEdit(
          ctx,
          `🔒 <b>${escapeHtml(test.name)}</b> testini yopasizmi?\n\n` +
            "Yopilgandan keyin javoblar qabul qilinmaydi. Natijalar Rasch modeli bo'yicha hisoblanib, avval " +
            "faqat sizga ko'rsatiladi — qatnashchilarga siz tasdiqlaganingizdan keyin yuboriladi.",
          { reply_markup: confirmKb('close', id) },
        );

      case 'closeok': {
        await ctx.answerCallbackQuery({ text: 'Hisoblanmoqda...' });
        await safeEdit(ctx, '⏳ Natijalar hisoblanmoqda...');
        const result = await closeTest(test._id);
        if (!result) {
          const fresh = await Test.findById(id);
          return showTestCard(ctx, fresh);
        }
        await showTestCard(ctx, result.test);
        await ctx.reply(adminCloseSummary(result.test, result.submissions), HTML);
        if (result.submissions.length) await sendReport(ctx, result.test, result.submissions);
        return showTestCard(ctx, result.test, false);
      }

      case 'publish': {
        if (!awaitingPublish) {
          return ctx.answerCallbackQuery({ text: 'Natijalar allaqachon yuborilgan yoki test yopilmagan' });
        }
        await ctx.answerCallbackQuery();
        const flagged = test.items.filter((i) => i.flag).length;
        return safeEdit(
          ctx,
          `📤 <b>${escapeHtml(test.name)}</b> natijalari barcha qatnashchilarga yuborilsinmi?\n\n` +
            (flagged ? `⚠️ ${flagged} ta savol bo'yicha ogohlantirish bor — kalitni tekshirdingizmi?\n` : '') +
            "Yuborilgandan keyin kalitni o'zgartirib bo'lmaydi.",
          { reply_markup: confirmKb('publish', id) },
        );
      }

      case 'publishok': {
        const result = await publishTest(test._id);
        if (!result) {
          await ctx.answerCallbackQuery({ text: 'Natijalar allaqachon yuborilgan' });
          return showTestCard(ctx, (await Test.findById(id)) ?? test);
        }
        await ctx.answerCallbackQuery({ text: 'Yuborilmoqda...' });
        await showTestCard(ctx, result.test);
        const real = result.submissions.filter((s) => !s.simulated).length;
        await ctx.reply(`📨 Natijalar ${real} ta qatnashchiga yuborilmoqda...`);
        startNotify(ctx.api, result.test, result.submissions, ctx.chat.id);
        return;
      }

      case 'fix':
        if (!awaitingPublish) {
          return ctx.answerCallbackQuery({ text: "Natijalar yuborilgan — kalitni o'zgartirib bo'lmaydi" });
        }
        await ctx.answerCallbackQuery();
        await setState(ctx, 'fix_key', { testId: id });
        return ctx.reply(fixKeyPrompt(test), { ...HTML, reply_markup: cancelMenu });

      case 'reopen': {
        if (!awaitingPublish) return ctx.answerCallbackQuery({ text: "Bu testni qayta ochib bo'lmaydi" });
        const reopened = await reopenTest(test._id);
        await ctx.answerCallbackQuery({ text: reopened ? 'Test qayta ochildi' : "Holat o'zgargan" });
        return showTestCard(ctx, reopened ?? (await Test.findById(id)) ?? test);
      }

      case 'report': {
        if (test.status !== 'closed') return ctx.answerCallbackQuery({ text: 'Test hali yopilmagan' });
        await ctx.answerCallbackQuery({ text: 'Tayyorlanmoqda...' });
        const subs = await Submission.find({ test: test._id }).sort({ rank: 1, createdAt: 1 });
        if (!subs.length) return ctx.reply('Bu testda qatnashchilar yo\'q.');
        return sendReport(ctx, test, subs);
      }

      case 'del':
        await ctx.answerCallbackQuery();
        return safeEdit(
          ctx,
          `🗑 <b>${escapeHtml(test.name)}</b> (#${test.code}) testi va uning barcha javoblari o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`,
          { reply_markup: confirmKb('del', id) },
        );

      case 'delok':
        await deleteTest(test._id);
        await ctx.answerCallbackQuery({ text: "O'chirildi" });
        return showTestList(ctx, true);
    }
  });

  bot.command('simulate', adminOnly, async (ctx) => {
    if (!config.enableSimulate) return ctx.reply('Sinov rejimi o\'chirilgan (.env: ENABLE_SIMULATE=true).');
    const [code, countRaw] = ctx.match.trim().split(/\s+/);
    const count = Math.min(Number(countRaw) || 30, 2000);
    const test = code ? await findTestByCode(code) : null;
    if (!test) return ctx.reply('Foydalanish: <code>/simulate KOD SONI</code>, masalan <code>/simulate 12345 50</code>', HTML);
    if (test.status !== 'open') return ctx.reply('Test yopilgan.');
    const n = await simulateSubmissions(test, count);
    return ctx.reply(`🧪 ${n} ta sinov qatnashchisi qo'shildi (#${test.code}).`);
  });
}
