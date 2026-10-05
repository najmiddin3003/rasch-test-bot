import { escapeHtml, formatClosedBlock, formatDate, formatNumber, formatOpenBlock } from '../lib/format.js';
import { GRADES, MAX_T, PASS_MIN } from '../lib/scoring.js';

export const HTML = { parse_mode: 'HTML' };

export function welcome(name) {
  return `Assalomu alaykum, <b>${escapeHtml(name)}</b>! 👋\n\nTest topshirish uchun o'qituvchingiz bergan <b>test kodini</b> yuboring yoki «📝 Test topshirish» tugmasini bosing.`;
}

export const askName = "Ism-familiyangizni kiriting (masalan: <b>Aliyev Vali</b>).\nU natijalarda va reytingda ko'rinadi.";

export function help(isAdmin) {
  let text =
    '<b>Qanday ishlaydi?</b>\n\n' +
    "1. O'qituvchidan test kodini oling va botga yuboring.\n" +
    '2. Yopiq savollar javobini bitta xabarda yuboring: <code>abcdabcd...</code> yoki <code>1a2b3c...</code>. ' +
    'Javob bermagan savolga <code>x</code> qo\'ying.\n' +
    "3. Ochiq savollar bo'lsa, har bir javobni yangi qatorda yuboring.\n" +
    '4. Test yopilgach, natijangiz <b>Rasch modeli</b> asosida hisoblanib, sizga yuboriladi.\n\n' +
    '<b>Baholash (Milliy sertifikat metodikasi):</b>\n' +
    `T-ball = 50 + 10·Z, Z = (θ − o'rtacha) / SD, maksimal ${MAX_T} ball.\n` +
    "θ — Rasch modelidagi qobiliyat: savollarning qiyinligi barcha qatnashchilar javoblaridan aniqlanadi. " +
    "Rasch modelida bitta testda bir xil sondagi to'g'ri javob bir xil ball beradi, " +
    "lekin ballar orasidagi masofa va yakuniy ball savollar qiyinligi hamda guruh natijalariga bog'liq.\n" +
    GRADES.map((g) => `${g.grade} — ${g.min} va undan yuqori`).join('\n') +
    `\n${PASS_MIN} dan past — o'tmadi`;
  if (isAdmin) {
    text +=
      '\n\n<b>Admin uchun:</b>\n' +
      '«➕ Yangi test» — test yaratish (nom → yopiq kalit → ochiq kalit).\n' +
      "«📋 Testlar» — testlar ro'yxati, yopish, Excel hisobot.\n" +
      'Test yopilganda natijalar avval faqat sizga ko\'rsatiladi: shubhali savollarni tekshirib, ' +
      'kerak bo\'lsa kalitni tuzating, keyin «📤 Natijalarni yuborish» ni bosing.';
  }
  return text;
}

export function testSummary(test, participants, botUsername) {
  const closed = test.items.filter((i) => i.kind === 'closed').length;
  const open = test.items.length - closed;
  let status;
  if (test.status === 'open') status = '🟢 Ochiq';
  else if (test.status === 'closing') status = '⏳ Hisoblanmoqda';
  else if (!test.publishedAt) status = `🟡 Yopilgan (${formatDate(test.closedAt)}), natijalar hali yuborilmagan`;
  else status = `🔴 Yopilgan, natijalar yuborilgan (${formatDate(test.publishedAt)})`;
  return (
    `📝 <b>${escapeHtml(test.name)}</b>\n\n` +
    `🔑 Kod: <code>${test.code}</code>\n` +
    `🔗 Havola: https://t.me/${botUsername}?start=${test.code}\n` +
    `❓ Savollar: ${test.items.length} (yopiq ${closed}, ochiq ${open})\n` +
    `👥 Qatnashchilar: ${participants}\n` +
    `📅 Yaratilgan: ${formatDate(test.createdAt)}\n` +
    `📌 Holati: ${status}`
  );
}

export function keyText(test) {
  const closed = test.items.filter((i) => i.kind === 'closed');
  const open = test.items.filter((i) => i.kind === 'open');
  let text = `🔑 <b>${escapeHtml(test.name)}</b> kaliti\n`;
  if (closed.length) text += `\n<b>Yopiq (${closed.length}):</b>\n${formatClosedBlock(closed.map((i) => i.key[0]))}\n`;
  if (open.length) {
    text += `\n<b>Ochiq (${open.length}):</b>\n${formatOpenBlock(
      open.map((i) => i.label),
      open.map((i) => i.key.join(' ; ')),
    )}`;
  }
  return text;
}

export function closedPrompt(test) {
  const n = test.items.filter((i) => i.kind === 'closed').length;
  return (
    `📝 <b>${escapeHtml(test.name)}</b>\n\n` +
    `Yopiq savollar: <b>1–${n}</b> (${n} ta).\n` +
    'Javoblarni bitta xabarda yuboring:\n' +
    '<code>abcdabcd...</code> yoki <code>1a2b3c4d...</code>\n' +
    "Javob bermagan savolga <code>x</code> qo'ying."
  );
}

export function openPrompt(labels) {
  return (
    `Ochiq savollar: <b>${labels.join(', ')}</b> (${labels.length} ta).\n\n` +
    "Har bir javobni <b>yangi qatorda</b>, tartib bilan yuboring. Javob bo'lmasa <code>-</code> yozing.\n" +
    `Yoki raqami bilan: <code>${labels[0]}=12</code>`
  );
}

export function submissionPreview(test, answers) {
  const closedItems = test.items.filter((i) => i.kind === 'closed');
  const openItems = test.items.filter((i) => i.kind === 'open');
  let text = `📋 <b>Javoblaringizni tekshiring</b>\n${escapeHtml(test.name)}\n`;
  if (closedItems.length) text += `\n<b>Yopiq:</b>\n${formatClosedBlock(answers.slice(0, closedItems.length))}\n`;
  if (openItems.length) {
    text += `\n<b>Ochiq:</b>\n${formatOpenBlock(
      openItems.map((i) => i.label),
      answers.slice(closedItems.length),
    )}\n`;
  }
  text += '\nTasdiqlagandan keyin javoblarni o\'zgartirib bo\'lmaydi.';
  return text;
}

export function studentResult(test, submission) {
  const total = test.items.length;
  const wrong = test.items.filter((_, i) => !submission.correct[i]).map((i) => i.label);
  const percent = total ? ((submission.rawScore / total) * 100).toFixed(1) : '0';
  let text =
    `📊 <b>Test natijasi</b>\n` +
    `📝 ${escapeHtml(test.name)} (#${test.code})\n` +
    `👤 ${escapeHtml(submission.fullName)}\n\n` +
    `✅ To'g'ri javoblar: <b>${submission.rawScore}/${total}</b> (${percent}%)\n` +
    `📈 Rasch bali (T): <b>${formatNumber(submission.tScore)}</b>\n` +
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
  text += `✅ O'rtacha to'g'ri javob: ${avgRaw.toFixed(1)}/${total}\n\n<b>Darajalar:</b>\n`;
  for (const g of GRADES) {
    const c = submissions.filter((s) => s.grade === g.grade).length;
    text += `${g.grade}: ${c}\n`;
  }
  text += `O'tmadi: ${submissions.filter((s) => !s.grade).length}\n\n<b>Top 10:</b>\n`;
  text += submissions
    .slice(0, 10)
    .map((s) => `${s.rank}. ${escapeHtml(s.fullName)} — ${formatNumber(s.tScore)} (${s.grade || '—'}), ${s.rawScore}/${total}`)
    .join('\n');
  const st = test.stats || {};
  text += `\n\n🧮 Usul: ${METHOD_NAMES[st.method] ?? '—'}`;
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
    '<code>7=c\n31a=12;12.0</code>\n\n' +
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
        if (!test?.publishedAt || sub.tScore === null || sub.tScore === undefined) {
          return `⏳ ${name}\n   Natijalar hali e'lon qilinmagan`;
        }
        return `✅ ${name}\n   ${formatNumber(sub.tScore)} ball, ${sub.grade || "o'tmadi"}, o'rin ${sub.rank}`;
      })
      .join('\n\n')
  );
}
