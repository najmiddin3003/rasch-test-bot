// Barcha xabar shablonlari Telegram HTML talablariga mos bo'lishi kerak: faqat ruxsat etilgan
// teglar, "<" va "&" qochirilgan. Aks holda Telegram xabarni rad etadi va foydalanuvchi
// "Kutilmagan xatolik" ni ko'radi (auditda shunday ikki xato topilgan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminCloseSummary,
  closedDoneText,
  closedFeedback,
  closedQuestionText,
  essayDoneText,
  essayPromptText,
  fixKeyPrompt,
  help,
  keyText,
  myResultsText,
  openAnsweredText,
  openQuestionText,
  openSkippedText,
  studentResult,
  submissionPreview,
  testIntroText,
  testSummary,
  welcome,
} from '../src/bot/texts.js';

function assertTelegramHtml(text, name) {
  const stripped = text.replace(/<\/?(b|i|u|s|code|pre|a)(\s[^>]*)?>/g, '');
  assert.ok(!stripped.includes('<'), `${name}: qochirilmagan "<"`);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(stripped), `${name}: qochirilmagan "&"`);
  assert.ok(text.length <= 4096, `${name}: ${text.length} belgi > 4096`);
}

const evil = 'A <b>& "x"';
// Eng katta test: 150 yopiq (4 va 6 variantli) + 60 yozma, esse bilan
const items = [
  ...Array.from({ length: 150 }, (_, i) => ({
    label: String(i + 1),
    kind: 'closed',
    options: i % 50 < 45 ? 4 : 6,
    key: ['a'],
    correctCount: 1,
    flag: i < 20 ? "Kuchli o'quvchilar ko'proq xato qilgan — kalit xato bo'lishi mumkin" : null,
  })),
  ...Array.from({ length: 60 }, (_, i) => ({
    label: `${151 + i}a`,
    kind: 'open',
    key: ['x<5', 'a&b'],
    correctCount: 0,
    flag: "Hech kim to'g'ri topmagan — kalitni tekshiring (yoki savol juda qiyin)",
  })),
];

for (const n of [0, 2, 29, 31]) {
  for (const hasEssay of [false, true]) {
    test(`xabar shablonlari Telegram HTML ga mos (${n} qatnashchi, esse: ${hasEssay ? 'bor' : "yo'q"})`, () => {
      const t = {
        name: evil.repeat(10).slice(0, 100),
        code: '12345',
        format: hasEssay ? 'ona_tili' : 'free',
        hasEssay,
        items,
        status: 'closed',
        publishedAt: n % 2 ? new Date() : null,
        closedAt: new Date(),
        createdAt: new Date(),
        stats: { participants: n, method: 'CML+prior', reliability: 0.8, kr20: 0.82, converged: n !== 2 },
      };
      const subs = Array.from({ length: n }, (_, k) => ({
        rank: k + 1,
        fullName: `${evil} ${k}`,
        tScore: 75 - k,
        essay: hasEssay ? (k % 2 ? 0 : 61.5) : null,
        essaySkipped: hasEssay && k % 2 === 1,
        totalScore: hasEssay ? 70 - k : 75 - k,
        grade: k ? null : 'A+',
        rawScore: 3,
        correct: items.map((_, i) => (i % 3 ? 1 : 0)),
      }));
      // Eng uzun yozma javoblar (100 belgi) — ko'rib chiqish xabari qisqartirishi kerak
      const answers = items.map((it, i) => (it.kind === 'closed' ? (i % 7 ? 'b' : '') : `<1&2> ${'j'.repeat(95)}`));
      const closedItem = items[0];
      const openItem = items[150];
      const texts = {
        welcome: welcome(evil),
        help: help(true),
        card: testSummary(t, n, 'bot'),
        key: keyText(t),
        intro: testIntroText(t),
        closedQuestion: closedQuestionText(t, closedItem, 1, 150, closedFeedback(closedItem, 'c')),
        closedDone: closedDoneText(t, items.slice(0, 150), answers),
        openQuestion: openQuestionText(openItem, 1, 60, openSkippedText(openItem)),
        openAnswered: openAnsweredText(openItem, '<b>& javob'),
        essayPrompt: essayPromptText(openSkippedText(openItem)),
        essayDone: essayDoneText(61.5, false) + essayDoneText(0, true),
        preview: submissionPreview(t, answers, { essay: 58, essaySkipped: false }),
        summary: adminCloseSummary(t, subs),
        fix: fixKeyPrompt(t),
        myResults: myResultsText(subs.slice(0, 10).map((sub) => ({ test: t, sub }))),
      };
      if (n) texts.result = studentResult(t, subs[0]) + studentResult(t, subs.at(-1));
      for (const [name, text] of Object.entries(texts)) assertTelegramHtml(text, name);
    });
  }
}

test("natija xabari: esseli testda test bali, esse va umumiy ball ko'rsatiladi", () => {
  const t = { name: 'Ona tili', code: '1', hasEssay: true, items: [{ label: '1' }], stats: { participants: 2 } };
  const sub = { fullName: 'Ali', rawScore: 1, correct: [1], tScore: 62.4, essay: 58, totalScore: 60.2, grade: 'B+', rank: 1 };
  const text = studentResult(t, sub);
  assert.match(text, /Test bali \(Rasch\): <b>62\.4<\/b>/);
  assert.match(text, /Esse bali: <b>58\.0<\/b>/);
  assert.match(text, /Umumiy ball: <b>60\.2<\/b>/);
  const skipped = studentResult(t, { ...sub, essay: 0, essaySkipped: true, totalScore: 31.2, grade: null });
  assert.match(skipped, /Esse bali: <b>0 \(kiritilmagan\)<\/b>/);
});

test("uzun kalitlar va ko'p ogohlantirish ham 4096 belgiga sig'adi", () => {
  const long = 'juda uzun javob '.repeat(12);
  const t = {
    name: evil,
    code: '1',
    hasEssay: true,
    items: Array.from({ length: 60 }, (_, i) => ({
      label: String(151 + i),
      kind: 'open',
      key: [long, long, '<&>'],
      correctCount: 0,
      flag: "Hech kim to'g'ri topmagan — kalitni tekshiring (yoki savol juda qiyin)",
    })),
    status: 'closed',
    publishedAt: null,
    stats: { participants: 40, method: 'CML', reliability: 0.8, kr20: 0.8 },
  };
  const subs = [{ rank: 1, fullName: evil, tScore: 50, totalScore: 50, essay: 50, rawScore: 1, grade: 'C+', correct: [] }];
  assertTelegramHtml(keyText(t), 'kalit');
  assertTelegramHtml(adminCloseSummary(t, subs), 'xulosa');
  assertTelegramHtml(fixKeyPrompt(t), 'tuzatish');
  assertTelegramHtml(submissionPreview(t, t.items.map(() => long + long), { essay: 50 }), "ko'rib chiqish");
  assert.match(adminCloseSummary(t, subs), /Tekshirish kerak bo'lgan savollar \(60\)/);
});
