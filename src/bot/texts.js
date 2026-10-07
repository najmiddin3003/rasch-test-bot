import { escapeHtml, formatClosedBlock, formatDate, formatNumber, formatOpenBlock } from '../lib/format.js';
import { ESSAY_MAX, formatTitle, optionsSummary, questionName } from '../lib/formats.js';
import { GRADES, MAX_T, PASS_MIN } from '../lib/scoring.js';

export const HTML = { parse_mode: 'HTML' };

/** Yakuniy ball: esseli testda (test + esse) / 2, aks holda Rasch T-ball */
export const scoreOf = (s) => s.totalScore ?? s.tScore;

export function welcome(name) {
  return `Assalomu alaykum, <b>${escapeHtml(name)}</b>! 👋\n\nTest topshirish uchun o'qituvchingiz bergan <b>test kodini</b> yuboring yoki «📝 Test topshirish» tugmasini bosing.`;
}

export const askName = "Ism-familiyangizni kiriting (masalan: <b>Aliyev Vali</b>).\nU natijalarda va reytingda ko'rinadi.";

export function help(isAdmin) {
  let text =
    '<b>Qanday ishlaydi?</b>\n\n' +
    "1. O'qituvchidan test kodini oling va botga yuboring.\n" +
    "2. Yopiq savollarda javobni tugma bilan tanlang — keyingi savol shu xabarning o'zida chiqadi. " +
    "Bilmasangiz «⏭ O'tkazish».\n" +
    "3. Yozma savollarni bot bittalab so'raydi — javobni yozib yuboring yoki «⏭ O'tkazish» ni bosing.\n" +
    `4. Esseli testda oxirida esse balingizni (0–${ESSAY_MAX}) kiritasiz.\n` +
    '5. Oxirida javoblaringizni tekshirib tasdiqlaysiz. Xatoni tuzatish uchun <code>12=b</code>, ' +
    '<code>37=javob</code> yoki <code>esse=60</code> deb yozing.\n' +
    '6. Test yopilgach, natijangiz <b>Rasch modeli</b> asosida hisoblanib, sizga yuboriladi.\n\n' +
    '<b>Baholash (Milliy sertifikat metodikasi):</b>\n' +
    `T-ball = 50 + 10·Z, Z = (θ − o'rtacha) / SD, maksimal ${MAX_T} ball.\n` +
    'Esseli testda umumiy ball = (test bali + esse bali) / 2.\n' +
    "θ — Rasch modelidagi qobiliyat: savollarning qiyinligi barcha qatnashchilar javoblaridan aniqlanadi. " +
    "Rasch modelida bitta testda bir xil sondagi to'g'ri javob bir xil ball beradi, " +
    "lekin ballar orasidagi masofa va yakuniy ball savollar qiyinligi hamda guruh natijalariga bog'liq.\n" +
    GRADES.map((g) => `${g.grade} — ${g.min} va undan yuqori`).join('\n') +
    `\n${PASS_MIN} dan past — o'tmadi`;
  if (isAdmin) {
    text +=
      '\n\n<b>Admin uchun:</b>\n' +
      '«➕ Yangi test» — format tanlanadi: «Ona tili (Milliy sertifikat)» (1–32 A–D, 33–35 A–F, ' +
      "36–39 va 40–44 a/b yozma, esse) yoki erkin format.\n" +
      "«📋 Testlar» — testlar ro'yxati, yopish, Excel hisobot.\n" +
      'Test yopilganda natijalar avval faqat sizga ko\'rsatiladi: shubhali savollarni tekshirib, ' +
      'kerak bo\'lsa kalitni tuzating, keyin «📤 Natijalarni yuborish» ni bosing.';
  }
  return text;
}

function countLine(test) {
  const closed = test.items.filter((i) => i.kind === 'closed').length;
  const open = test.items.length - closed;
  return `${test.items.length} (yopiq ${closed}, yozma ${open})${test.hasEssay ? ' + esse' : ''}`;
}

export function testSummary(test, participants, botUsername) {
  let status;
  if (test.status === 'open') status = '🟢 Ochiq';
  else if (test.status === 'closing') status = '⏳ Hisoblanmoqda';
  else if (!test.publishedAt) status = `🟡 Yopilgan (${formatDate(test.closedAt)}), natijalar hali yuborilmagan`;
  else status = `🔴 Yopilgan, natijalar yuborilgan (${formatDate(test.publishedAt)})`;
  return (
    `📝 <b>${escapeHtml(test.name)}</b>\n\n` +
    `🔑 Kod: <code>${test.code}</code>\n` +
    `🔗 Havola: https://t.me/${botUsername}?start=${test.code}\n` +
    `📘 Format: ${formatTitle(test.format)}\n` +
    `❓ Savollar: ${countLine(test)}\n` +
    `👥 Qatnashchilar: ${participants}\n` +
    `📅 Yaratilgan: ${formatDate(test.createdAt)}\n` +
    `📌 Holati: ${status}`
  );
}

export function keyText(test) {
  const closed = test.items.filter((i) => i.kind === 'closed');
  const open = test.items.filter((i) => i.kind === 'open');
  let text = `🔑 <b>${escapeHtml(test.name)}</b> kaliti\n`;
  if (closed.length) {
    text += `\n<b>Yopiq (${closed.length})</b> — ${optionsSummary(test.items)}:\n${formatClosedBlock(closed.map((i) => i.key[0]))}\n`;
  }
  if (open.length) {
    text += `\n<b>Yozma (${open.length}):</b>\n${formatOpenBlock(
      open.map((i) => i.label),
      open.map((i) => i.key.join(' ; ')),
    )}\n`;
  }
  if (test.hasEssay) text += `\n<b>Esse:</b> o'quvchi balni o'zi kiritadi (0–${ESSAY_MAX})`;
  return text;
}

/** Javob berishni boshlashdan oldingi ma'lumot */
export function testIntroText(test) {
  const closed = test.items.filter((i) => i.kind === 'closed').length;
  const open = test.items.length - closed;
  let text = `📝 <b>${escapeHtml(test.name)}</b>\n`;
  if (closed) text += `\nYopiq savollar: <b>${closed}</b> ta (${optionsSummary(test.items)}) — tugma bilan tanlanadi`;
  if (open) text += `\nYozma savollar: <b>${open}</b> ta — bittalab so'raladi`;
  if (test.hasEssay) text += `\nEsse: oxirida esse balingizni (0–${ESSAY_MAX}) kiritasiz`;
  return text;
}

function progressBar(done, total, width = 10) {
  const filled = total ? Math.round((done / total) * width) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

/** Oldingi javob haqida qisqa qator: "✅ 11-savol: C" yoki "⏭ 11-savol: o'tkazildi" */
export function closedFeedback(item, letter) {
  return letter ? `✅ ${item.label}-savol: <b>${letter.toUpperCase()}</b>` : `⏭ ${item.label}-savol: o'tkazildi`;
}

/** Yopiq savol xabari (bitta xabar tahrirlanib, savollar almashib turadi) */
export function closedQuestionText(test, item, ordinal, total, feedback = '') {
  return (
    `📝 <b>${escapeHtml(test.name)}</b> — yopiq savollar\n` +
    `${progressBar(ordinal - 1, total)} ${ordinal}/${total}\n` +
    (feedback ? `${feedback}\n` : '') +
    `\n❓ <b>${item.label}-savol</b> — javobni tanlang:`
  );
}

export function closedDoneText(test, closedItems, answers) {
  const missing = closedItems.filter((it) => !answers[test.items.indexOf(it)]).map((it) => it.label);
  return (
    `📝 <b>${escapeHtml(test.name)}</b>\n✅ Yopiq savollar tugadi: ${closedItems.length} ta` +
    (missing.length ? `\n⏭ Javobsiz: ${missing.join(', ')}` : '\nHammasiga javob berildi.')
  );
}

/** Yozma savol so'rovi */
export function openQuestionText(item, ordinal, total, feedback = '') {
  return (
    (feedback ? `${feedback}\n\n` : '') +
    `✍️ <b>${questionName(item.label)}</b> — javobingizni yozing:\n<i>Yozma savollar: ${ordinal}/${total}</i>`
  );
}

export function openAnsweredText(item, answer) {
  return `✍️ <b>${questionName(item.label)}</b>: <code>${escapeHtml(answer)}</code> ✅`;
}

export function openSkippedText(item) {
  return `⏭ ${questionName(item.label)}: o'tkazildi`;
}

export function essayPromptText(feedback = '') {
  return (
    (feedback ? `${feedback}\n\n` : '') +
    `📝 <b>Esse bali</b> — 0 dan ${ESSAY_MAX} gacha kiriting (masalan: <code>58</code> yoki <code>61.5</code>).\n` +
    "Esse yozmagan bo'lsangiz «⏭ O'tkazish» ni bosing — esse 0 ball hisoblanadi."
  );
}

export function essayDoneText(essay, skipped) {
  return skipped ? "⏭ Esse: kiritilmadi (0 ball)" : `📝 Esse bali: <b>${formatNumber(essay)}</b> ✅`;
}

function essayLine(essay, skipped) {
  return skipped || essay === null || essay === undefined ? `0 (kiritilmagan)` : formatNumber(essay);
}

/**
 * @param {{ essay?: number|null, essaySkipped?: boolean }} essayInfo
 */
const MAX_MESSAGE = 4096;

export function submissionPreview(test, answers, { essay = null, essaySkipped = false } = {}) {
  const closedItems = test.items.filter((i) => i.kind === 'closed');
  const openItems = test.items.filter((i) => i.kind === 'open');
  let head = `📋 <b>Javoblaringizni tekshiring</b>\n${escapeHtml(test.name)}\n`;
  if (closedItems.length) {
    head += `\n<b>Yopiq (${closedItems.length}):</b>\n${formatClosedBlock(closedItems.map((it) => answers[test.items.indexOf(it)] || ''))}\n`;
  }
  let tail = '';
  if (test.hasEssay) tail += `\n<b>Esse:</b> ${essayLine(essay, essaySkipped)}\n`;
  const missing = test.items.filter((it, i) => !answers[i]).map((it) => it.label);
  if (missing.length) {
    const list = missing.slice(0, 30).join(', ') + (missing.length > 30 ? ' ...' : '');
    tail += `\n⚠️ Javobsiz: ${list}\n`;
  }
  tail +=
    '\n✏️ Javobni o\'zgartirish uchun shu yerga yozing (har qatorda bittadan): ' +
    `<code>12=b</code>, <code>37=javob</code>${test.hasEssay ? ', <code>esse=60</code>' : ''}.\n` +
    "Tasdiqlagandan keyin o'zgartirib bo'lmaydi.";

  if (!openItems.length) return head + tail;
  // Uzun yozma javoblar qisqartiriladi — xabar Telegram chegarasidan (4096) oshmaguncha
  const openBlock = (limit) =>
    `\n<b>Yozma (${openItems.length}):</b>\n${formatOpenBlock(
      openItems.map((i) => i.label),
      openItems.map((it) => {
        const a = answers[test.items.indexOf(it)] || '';
        return a.length > limit ? `${a.slice(0, Math.max(1, limit - 1))}…` : a;
      }),
    )}\n`;
  for (let limit = 100; limit > 1; limit = Math.floor(limit * 0.8)) {
    const text = head + openBlock(limit) + tail;
    if (text.length <= MAX_MESSAGE) return text;
  }
  return head + openBlock(1) + tail;
}

export function studentResult(test, submission) {
  const total = test.items.length;
  const wrong = test.items.filter((_, i) => !submission.correct[i]).map((i) => i.label);
  const percent = total ? ((submission.rawScore / total) * 100).toFixed(1) : '0';
  let text =
    `📊 <b>Test natijasi</b>\n` +
    `📝 ${escapeHtml(test.name)} (#${test.code})\n` +
    `👤 ${escapeHtml(submission.fullName)}\n\n` +
    `✅ To'g'ri javoblar: <b>${submission.rawScore}/${total}</b> (${percent}%)\n`;
  if (test.hasEssay) {
    text +=
      `📈 Test bali (Rasch): <b>${formatNumber(submission.tScore)}</b>\n` +
      `📝 Esse bali: <b>${essayLine(submission.essay, submission.essaySkipped)}</b>\n` +
      `🎯 Umumiy ball: <b>${formatNumber(scoreOf(submission))}</b>\n`;
  } else {
    text += `📈 Rasch bali (T): <b>${formatNumber(scoreOf(submission))}</b>\n`;
  }
  text +=
    `🏅 Daraja: <b>${submission.grade || `— (${PASS_MIN} balldan past)`}</b>\n` +
    `🏆 O'rin: ${submission.rank}/${test.stats?.participants ?? '?'}`;
  if (wrong.length) {
    const list = wrong.slice(0, 60).join(', ') + (wrong.length > 60 ? ' ...' : '');
    text += `\n\n❌ Xato/javobsiz: ${list}`;
  }
  return text;
}

const METHOD_NAMES = {
  CML: 'CML + WLE',
  'CML+prior': 'CML (zaif prior bilan) + WLE',
  logit: 'taxminiy (ma\'lumot juda kam)',
  none: '—',
};

export function flaggedItemsText(test) {
  const flagged = test.items.filter((i) => i.flag);
  if (!flagged.length) return '';
  const lines = flagged.slice(0, 15).map((i) => {
    const key = i.kind === 'closed' ? i.key[0].toUpperCase() : i.key.join(' ; ');
    return `• <b>${i.label}</b> (kalit: ${escapeHtml(key)}, to'g'ri: ${i.correctCount}) — ${escapeHtml(i.flag)}`;
  });
  if (flagged.length > 15) lines.push(`... yana ${flagged.length - 15} ta (Excel faylda)`);
  return `\n\n⚠️ <b>Tekshirish kerak bo'lgan savollar:</b>\n${lines.join('\n')}`;
}

export function adminCloseSummary(test, submissions) {
  const n = submissions.length;
  const head = test.publishedAt ? '📊 <b>Natijalar</b>' : '🔒 <b>Test yopildi va hisoblandi</b>';
  let text = `${head}: ${escapeHtml(test.name)} (#${test.code})\n👥 Qatnashchilar: <b>${n}</b>\n`;
  if (!n) return text + '\nHech kim javob yubormagan.';

  const total = test.items.length;
  const avgRaw = submissions.reduce((a, s) => a + s.rawScore, 0) / n;
  text += `✅ O'rtacha to'g'ri javob: ${avgRaw.toFixed(1)}/${total}\n`;
  if (test.hasEssay) {
    const avgEssay = submissions.reduce((a, s) => a + (s.essay ?? 0), 0) / n;
    text += `📝 O'rtacha esse bali: ${avgEssay.toFixed(1)}\n`;
  }
  text += '\n<b>Darajalar:</b>\n';
  for (const g of GRADES) {
    const c = submissions.filter((s) => s.grade === g.grade).length;
    text += `${g.grade}: ${c}\n`;
  }
  text += `O'tmadi: ${submissions.filter((s) => !s.grade).length}\n\n<b>Top 10:</b>\n`;
  text += submissions
    .slice(0, 10)
    .map((s) => {
      const parts = test.hasEssay
        ? ` · test ${formatNumber(s.tScore)}, esse ${essayLine(s.essay, s.essaySkipped)}`
        : '';
      return `${s.rank}. ${escapeHtml(s.fullName)} — ${formatNumber(scoreOf(s))} (${s.grade || '—'})${parts}, ${s.rawScore}/${total}`;
    })
    .join('\n');
  const st = test.stats || {};
  text += `\n\n🧮 Usul: ${METHOD_NAMES[st.method] ?? '—'}`;
  if (test.hasEssay) text += '\n🎯 Umumiy ball = (test bali + esse bali) / 2';
  if (st.reliability !== null && st.reliability !== undefined) {
    text += `\n📐 Ishonchlilik: ${st.reliability.toFixed(2)} (Rasch), KR-20: ${st.kr20 === null ? '—' : st.kr20.toFixed(2)}`;
  }
  text += flaggedItemsText(test);
  if (n < 30) {
    text += `\n\n⚠️ Qatnashchilar soni kam (${n} &lt; 30) — Rasch baholari aniqligi past bo'lishi mumkin.`;
  }
  if (st.converged === false) {
    text += '\n⚠️ Rasch hisobi to\'liq yaqinlashmadi — natijalarni ehtiyotkorlik bilan baholang.';
  }
  if (st.method === 'CML+prior') {
    text += "\nℹ️ Javoblar to'liq «zinapoya» shaklida (Guttman) — aniq CML yechimi yo'q, zaif prior ishlatildi.";
  }
  if (!test.publishedAt) {
    text +=
      '\n\n❗ Natijalar hali qatnashchilarga <b>yuborilmadi</b>. Tekshirib chiqing: kalit xato bo\'lsa ' +
      '«✏️ Kalitni tuzatish», hammasi to\'g\'ri bo\'lsa «📤 Natijalarni yuborish» ni bosing.';
  }
  return text;
}

export function fixKeyPrompt(test) {
  return (
    '✏️ <b>Kalitni tuzatish</b>\n\n' +
    'Tuzatiladigan savollarni yuboring — har qatorda bitta:\n' +
    '<code>7=c\n37=javob;muqobil javob</code>\n\n' +
    "Barcha javoblar yangi kalit bo'yicha qayta tekshiriladi va Rasch qayta hisoblanadi." +
    flaggedItemsText(test)
  );
}

export function myResultsText(rows) {
  if (!rows.length) return "Siz hali birorta testda qatnashmagansiz.";
  return (
    '📊 <b>Natijalarim</b> (oxirgi 10 ta)\n\n' +
    rows
      .map(({ test, sub }) => {
        const name = `${escapeHtml(test?.name ?? "O'chirilgan test")}${test ? ` (#${test.code})` : ''}`;
        const score = scoreOf(sub);
        if (!test?.publishedAt || score === null || score === undefined) {
          return `⏳ ${name}\n   Natijalar hali e'lon qilinmagan`;
        }
        return `✅ ${name}\n   ${formatNumber(score)} ball, ${sub.grade || "o'tmadi"}, o'rin ${sub.rank}`;
      })
      .join('\n\n')
  );
}
