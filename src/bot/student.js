import { Test } from '../models/Test.js';
import { Submission } from '../models/Submission.js';
import { MAX_OPEN_ANSWER, checkClosedRange, parseClosed, parseEssay, parseStudentFixes } from '../lib/answers.js';
import { optionLetters } from '../lib/formats.js';
import { escapeHtml } from '../lib/format.js';
import { findTestByCode, submitAnswers, SubmitError } from '../services/testService.js';
import { cancelMenu, closedAnswerKb, essaySkipKb, openSkipKb, submitConfirmKb } from './keyboards.js';
import {
  HTML,
  closedDoneText,
  closedFeedback,
  closedQuestionText,
  essayDoneText,
  essayPromptText,
  myResultsText,
  openAnsweredText,
  openQuestionText,
  openSkippedText,
  submissionPreview,
  testIntroText,
} from './texts.js';
import { replyWithMenu, resetState, setState } from './helpers.js';

// O'quvchi holatlari (stateData: testId, answers, pos, msgId, essay, essaySkipped):
//   st_answer  — pos: navbatdagi savol (yopiq — tugmalar bilan, yozma — matn bilan)
//   st_essay   — esse balini kutish
//   st_confirm — javoblarni tekshirish, tuzatish va tasdiqlash
// msgId — tugmalari faol bo'lgan xabar: boshqa (eski) xabardagi tugmalar e'tiborga olinmaydi.

const STALE = "Bu tugma eskirgan.";

const closedItemsOf = (test) => test.items.filter((i) => i.kind === 'closed');
const openItemsOf = (test) => test.items.filter((i) => i.kind === 'open');

function copyData(stateData) {
  return { ...stateData, answers: [...(stateData?.answers || [])] };
}

/**
 * Xabarni tahrirlash. true — xabar ko'rinishi to'g'ri (tahrirlandi yoki o'zgarishsiz edi);
 * false — tahrirlab bo'lmadi (masalan, o'chirilgan), chaqiruvchi yangi xabar yuborishi mumkin.
 */
async function editById(ctx, msgId, text, extra = {}) {
  if (!msgId) return false;
  try {
    await ctx.api.editMessageText(ctx.chat.id, msgId, text, { ...HTML, ...extra });
    return true;
  } catch (err) {
    return String(err?.description || err?.message).includes('message is not modified');
  }
}

const callbackMsgId = (ctx) => ctx.callbackQuery?.message?.message_id;

/** Test kodini qabul qilib, javob kiritishni boshlash */
export async function beginTest(ctx, code) {
  const test = await findTestByCode(code);
  if (!test) {
    await setState(ctx, 'await_code');
    return ctx.reply(`❗ <code>${escapeHtml(String(code).slice(0, 20))}</code> kodli test topilmadi. Kodni tekshirib, qayta yuboring.`, {
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
  return startAnswering(ctx, test);
}

async function startAnswering(ctx, test) {
  await ctx.reply(testIntroText(test), { ...HTML, reply_markup: cancelMenu });
  const data = {
    testId: test._id.toString(),
    answers: new Array(test.items.length).fill(null),
    pos: 0,
    msgId: null,
    essay: null,
    essaySkipped: false,
  };
  return showNext(ctx, test, data);
}

/**
 * Navbatdagi qadamni ko'rsatish: yopiq savol, yozma savol, esse yoki tekshirish.
 * editMsgId berilsa — shu xabar tahrirlanadi (savollar bitta xabarda almashadi), aks holda yangi xabar.
 */
async function showNext(ctx, test, data, { editMsgId = null, feedback = '' } = {}) {
  const item = test.items[data.pos];
  const show = async (text, keyboard) => {
    if (editMsgId && (await editById(ctx, editMsgId, text, { reply_markup: keyboard }))) return editMsgId;
    return (await ctx.reply(text, { ...HTML, reply_markup: keyboard })).message_id;
  };

  if (item?.kind === 'closed') {
    const closed = closedItemsOf(test);
    const text = closedQuestionText(test, item, closed.indexOf(item) + 1, closed.length, feedback);
    data.msgId = await show(text, closedAnswerKb(data.pos, item.options));
    return setState(ctx, 'st_answer', data);
  }
  if (item?.kind === 'open') {
    const open = openItemsOf(test);
    data.msgId = await show(openQuestionText(item, open.indexOf(item) + 1, open.length, feedback), openSkipKb(data.pos));
    return setState(ctx, 'st_answer', data);
  }
  if (test.hasEssay && data.essay === null && !data.essaySkipped) {
    data.msgId = await show(essayPromptText(feedback), essaySkipKb);
    return setState(ctx, 'st_essay', data);
  }
  if (editMsgId && feedback) await editById(ctx, editMsgId, feedback);
  return showPreview(ctx, test, data);
}

async function showPreview(ctx, test, data) {
  data.answers = data.answers.map((a) => a ?? '');
  const msg = await ctx.reply(submissionPreview(test, data.answers, data), { ...HTML, reply_markup: submitConfirmKb });
  data.msgId = msg.message_id;
  return setState(ctx, 'st_confirm', data);
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

/** Callback tugmasi joriy xabar va savolga tegishlimi (eski xabar yoki ikki marta bosish emas) */
function isCurrent(ctx, state, pos = null) {
  if (ctx.user.state !== state) return false;
  const data = ctx.user.stateData || {};
  if (ctx.callbackQuery?.message?.message_id !== data.msgId) return false;
  return pos === null || pos === data.pos;
}

/** Yopiq savollar bosqichida matn kelsa: barcha javoblar bitta xabarda bo'lishi mumkin */
async function handleBulkClosed(ctx, test, data, text) {
  const closed = closedItemsOf(test);
  const parsed = parseClosed(text, { expected: closed.length, allowSkip: true });
  const error = parsed.ok ? checkClosedRange(parsed.answers, closed.map((i) => i.options)) : parsed.error;
  if (error) {
    const looksLikeAnswers = text.replace(/\s/g, '').length >= Math.min(10, closed.length);
    await ctx.reply(
      '👆 Javobni yuqoridagi tugmalar bilan tanlang.\n' +
        `Yoki barcha ${closed.length} ta yopiq javobni bitta xabarda yuboring: <code>abcd...</code>` +
        (looksLikeAnswers ? `\n\n❗ ${escapeHtml(error)}` : ''),
      HTML,
    );
    return;
  }
  closed.forEach((it, k) => {
    data.answers[test.items.indexOf(it)] = parsed.answers[k];
  });
  await editById(ctx, data.msgId, closedDoneText(test, closed, data.answers));
  data.pos = test.items.indexOf(closed.at(-1)) + 1;
  await showNext(ctx, test, data);
}

/** Holatga qarab o'quvchi matnini qayta ishlash. true — xabar qayta ishlandi */
export async function handleStudentText(ctx, text) {
  const state = ctx.user.state;

  if (state === 'st_answer') {
    const test = await loadActiveTest(ctx);
    if (!test) return true;
    const data = copyData(ctx.user.stateData);
    const item = test.items[data.pos];
    if (item?.kind === 'closed') {
      await handleBulkClosed(ctx, test, data, text);
      return true;
    }
    if (item?.kind === 'open') {
      const answer = text.trim();
      if (answer.length > MAX_OPEN_ANSWER) {
        await ctx.reply(`❗ Javob juda uzun (${MAX_OPEN_ANSWER} belgigacha). Qisqaroq yozing.`);
        return true;
      }
      data.answers[data.pos] = answer;
      await editById(ctx, data.msgId, openAnsweredText(item, answer));
      data.pos += 1;
      await showNext(ctx, test, data);
      return true;
    }
    await showNext(ctx, test, data);
    return true;
  }

  if (state === 'st_essay') {
    const test = await loadActiveTest(ctx);
    if (!test) return true;
    const essay = parseEssay(text);
    if (essay === null) {
      await ctx.reply("❗ Esse bali 0 dan 75 gacha son bo'lishi kerak (masalan: <code>58</code> yoki <code>61.5</code>).", HTML);
      return true;
    }
    const data = copyData(ctx.user.stateData);
    data.essay = essay;
    data.essaySkipped = false;
    await editById(ctx, data.msgId, essayDoneText(essay, false));
    await showPreview(ctx, test, data);
    return true;
  }

  if (state === 'st_confirm') {
    const test = await loadActiveTest(ctx);
    if (!test) return true;
    const parsed = parseStudentFixes(text, test.items, { hasEssay: test.hasEssay });
    if (!parsed.ok) {
      await ctx.reply(
        `❗ ${escapeHtml(parsed.error)}\n\nJavobni o'zgartirish: <code>12=b</code>, <code>37=javob</code>` +
          `${test.hasEssay ? ', <code>esse=60</code>' : ''}. Yoki «✅ Tasdiqlash» ni bosing.`,
        HTML,
      );
      return true;
    }
    const data = copyData(ctx.user.stateData);
    for (const [idx, value] of parsed.fixes) data.answers[idx] = value;
    if (parsed.essay !== undefined) {
      data.essay = parsed.essay;
      data.essaySkipped = false;
    }
    // Eski ko'rib chiqish xabaridan tugmalarni olib tashlaymiz — faqat yangisi faol
    await ctx.api.editMessageReplyMarkup(ctx.chat.id, data.msgId).catch(() => {});
    await showPreview(ctx, test, data);
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
  // Yopiq savol: variant yoki «O'tkazish»
  bot.callbackQuery(/^q:(\d+):([a-f]|s)$/, async (ctx) => {
    const pos = Number(ctx.match[1]);
    if (!isCurrent(ctx, 'st_answer', pos)) return ctx.answerCallbackQuery({ text: STALE });
    const test = await loadActiveTest(ctx);
    if (!test) return ctx.answerCallbackQuery();
    const item = test.items[pos];
    const letter = ctx.match[2] === 's' ? '' : ctx.match[2];
    if (item?.kind !== 'closed' || (letter && !optionLetters(item.options).includes(letter))) {
      return ctx.answerCallbackQuery({ text: STALE });
    }
    await ctx.answerCallbackQuery();

    const data = copyData(ctx.user.stateData);
    data.answers[pos] = letter;
    data.pos = pos + 1;
    if (test.items[data.pos]?.kind === 'closed') {
      return showNext(ctx, test, data, { editMsgId: callbackMsgId(ctx), feedback: closedFeedback(item, letter) });
    }
    // Yopiq savollar tugadi: xabarda xulosa qoladi, keyingi bosqich — yangi xabarda
    await editById(ctx, callbackMsgId(ctx), closedDoneText(test, closedItemsOf(test), data.answers));
    return showNext(ctx, test, data);
  });

  // Yozma savolni o'tkazib yuborish
  bot.callbackQuery(/^o:(\d+):s$/, async (ctx) => {
    const pos = Number(ctx.match[1]);
    if (!isCurrent(ctx, 'st_answer', pos)) return ctx.answerCallbackQuery({ text: STALE });
    const test = await loadActiveTest(ctx);
    if (!test) return ctx.answerCallbackQuery();
    const item = test.items[pos];
    if (item?.kind !== 'open') return ctx.answerCallbackQuery({ text: STALE });
    await ctx.answerCallbackQuery();

    const data = copyData(ctx.user.stateData);
    data.answers[pos] = '';
    data.pos = pos + 1;
    if (test.items[data.pos]?.kind === 'open' || (test.hasEssay && data.essay === null && !data.essaySkipped)) {
      // Keyingi savol (yoki esse) shu xabarning o'zida chiqadi
      return showNext(ctx, test, data, { editMsgId: callbackMsgId(ctx), feedback: openSkippedText(item) });
    }
    await editById(ctx, callbackMsgId(ctx), openSkippedText(item));
    return showNext(ctx, test, data);
  });

  // Esseni o'tkazib yuborish — 0 ball
  bot.callbackQuery('e:s', async (ctx) => {
    if (!isCurrent(ctx, 'st_essay')) return ctx.answerCallbackQuery({ text: STALE });
    const test = await loadActiveTest(ctx);
    if (!test) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const data = copyData(ctx.user.stateData);
    data.essay = null;
    data.essaySkipped = true;
    await editById(ctx, callbackMsgId(ctx), essayDoneText(0, true));
    return showPreview(ctx, test, data);
  });

  bot.callbackQuery('sub:confirm', async (ctx) => {
    if (!isCurrent(ctx, 'st_confirm')) return ctx.answerCallbackQuery({ text: STALE });
    const test = await loadActiveTest(ctx);
    if (!test) return ctx.answerCallbackQuery();
    const data = ctx.user.stateData;
    try {
      await submitAnswers(
        test,
        ctx.user,
        data.answers.map((a) => a ?? ''),
        { essay: data.essay, essaySkipped: data.essaySkipped },
      );
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
    if (!isCurrent(ctx, 'st_confirm')) return ctx.answerCallbackQuery({ text: STALE });
    const test = await loadActiveTest(ctx);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    if (test) await startAnswering(ctx, test);
  });
}

export async function showMyResults(ctx) {
  const subs = await Submission.find({ userId: ctx.user.telegramId }).sort({ createdAt: -1 }).limit(10).populate('test');
  const rows = subs.map((sub) => ({ test: sub.test, sub }));
  return replyWithMenu(ctx, myResultsText(rows));
}
