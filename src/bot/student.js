import { Test } from '../models/Test.js';
import { Submission } from '../models/Submission.js';
import { parseClosed, parseOpenAnswers } from '../lib/answers.js';
import { escapeHtml } from '../lib/format.js';
import { findTestByCode, submitAnswers, SubmitError } from '../services/testService.js';
import { cancelMenu, submitConfirmKb } from './keyboards.js';
import { HTML, closedPrompt, myResultsText, openPrompt, submissionPreview } from './texts.js';
import { replyWithMenu, resetState, setState } from './helpers.js';

const openLabels = (test) => test.items.filter((i) => i.kind === 'open').map((i) => i.label);
const closedCount = (test) => test.items.filter((i) => i.kind === 'closed').length;

/** Test kodini qabul qilib, javob kiritishni boshlash */
export async function beginTest(ctx, code) {
  const test = await findTestByCode(code);
  if (!test) {
    await setState(ctx, 'await_code');
    return ctx.reply(`❗ <code>${String(code).slice(0, 20)}</code> kodli test topilmadi. Kodni tekshirib, qayta yuboring.`, {
      ...HTML,
      reply_markup: cancelMenu,
    });
  }
  if (test.status !== 'open') {
    await resetState(ctx);
    return replyWithMenu(ctx, '🔒 Bu test yopilgan, javoblar qabul qilinmaydi.');
  }
  if (await Submission.exists({ test: test._id, userId: ctx.user.telegramId })) {
    await resetState(ctx);
    return replyWithMenu(ctx, '✅ Siz bu testga javob yuborgansiz. Natija test yopilganda yuboriladi.');
  }
  return askAnswers(ctx, test);
}

async function askAnswers(ctx, test) {
  const data = { testId: test._id.toString(), answers: [] };
  if (closedCount(test)) {
    await setState(ctx, 'st_closed', data);
    return ctx.reply(closedPrompt(test), { ...HTML, reply_markup: cancelMenu });
  }
  await setState(ctx, 'st_open', data);
  return ctx.reply(`📝 <b>${escapeHtml(test.name)}</b>\n\n${openPrompt(openLabels(test))}`, {
    ...HTML,
    reply_markup: cancelMenu,
  });
}

async function loadActiveTest(ctx) {
  const test = await Test.findById(ctx.user.stateData?.testId);
  if (!test || test.status !== 'open') {
    await resetState(ctx);
    await replyWithMenu(ctx, '🔒 Test yopilgan yoki o\'chirilgan, javoblar qabul qilinmaydi.');
    return null;
  }
  return test;
}

async function showPreview(ctx, test, answers) {
  await setState(ctx, 'st_confirm', { testId: test._id.toString(), answers });
  return ctx.reply(submissionPreview(test, answers), { ...HTML, reply_markup: submitConfirmKb });
}

/** Holatga qarab o'quvchi matnini qayta ishlash. true — xabar qayta ishlandi */
export async function handleStudentText(ctx, text) {
  const state = ctx.user.state;

  if (state === 'st_closed') {
    const test = await loadActiveTest(ctx);
    if (!test) return true;
    const parsed = parseClosed(text, { expected: closedCount(test), allowSkip: true });
    if (!parsed.ok) {
      await ctx.reply(`❗ ${escapeHtml(parsed.error)}\n\nQayta yuboring.`, HTML);
      return true;
    }
    const labels = openLabels(test);
    if (labels.length) {
      await setState(ctx, 'st_open', { testId: test._id.toString(), answers: parsed.answers });
      await ctx.reply(openPrompt(labels), HTML);
    } else {
      await showPreview(ctx, test, parsed.answers);
    }
    return true;
  }

  if (state === 'st_open') {
    const test = await loadActiveTest(ctx);
    if (!test) return true;
    const parsed = parseOpenAnswers(text, openLabels(test));
    if (!parsed.ok) {
      await ctx.reply(`❗ ${escapeHtml(parsed.error)}\n\nQayta yuboring.`, HTML);
      return true;
    }
    await showPreview(ctx, test, [...(ctx.user.stateData.answers || []), ...parsed.answers]);
    return true;
  }

  if (state === 'st_confirm') {
    await ctx.reply('Yuqoridagi «✅ Tasdiqlash» yoki «🔄 Qayta kiritish» tugmasini bosing.');
    return true;
  }

  if (state === 'await_code' || state === null) {
    const code = text.trim();
    if (/^\d{4,6}$/.test(code)) {
      await beginTest(ctx, code);
      return true;
    }
    if (state === 'await_code') {
      await ctx.reply('❗ Test kodi faqat raqamlardan iborat bo\'ladi (masalan: <code>12345</code>).', HTML);
      return true;
    }
  }
  return false;
}

export function registerStudent(bot) {
  bot.callbackQuery('sub:confirm', async (ctx) => {
    if (ctx.user.state !== 'st_confirm') return ctx.answerCallbackQuery({ text: 'Bu so\'rov eskirgan.' });
    const test = await loadActiveTest(ctx);
    if (!test) return ctx.answerCallbackQuery();
    try {
      await submitAnswers(test, ctx.user, ctx.user.stateData.answers);
    } catch (err) {
      if (!(err instanceof SubmitError)) throw err;
      await resetState(ctx);
      await ctx.answerCallbackQuery();
      return replyWithMenu(ctx, `❗ ${err.message}`);
    }
    await resetState(ctx);
    await ctx.answerCallbackQuery({ text: 'Qabul qilindi ✅' });
    await ctx.editMessageReplyMarkup().catch(() => {});
    return replyWithMenu(
      ctx,
      `✅ Javoblaringiz qabul qilindi!\n\nNatijangiz test yopilgandan so'ng <b>Rasch modeli</b> asosida hisoblanib, shu yerga yuboriladi.`,
    );
  });

  bot.callbackQuery('sub:retry', async (ctx) => {
    if (ctx.user.state !== 'st_confirm') return ctx.answerCallbackQuery({ text: 'Bu so\'rov eskirgan.' });
    const test = await loadActiveTest(ctx);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    if (test) await askAnswers(ctx, test);
  });
}

export async function showMyResults(ctx) {
  const subs = await Submission.find({ userId: ctx.user.telegramId }).sort({ createdAt: -1 }).limit(10).populate('test');
  const rows = subs.map((sub) => ({ test: sub.test, sub }));
  return replyWithMenu(ctx, myResultsText(rows));
}
