// Barcha xabar shablonlari Telegram HTML talablariga mos bo'lishi kerak: faqat ruxsat etilgan
// teglar, "<" va "&" qochirilgan. Aks holda Telegram xabarni rad etadi va foydalanuvchi
// "Kutilmagan xatolik" ni ko'radi (auditda shunday ikki xato topilgan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminCloseSummary,
  closedPrompt,
  fixKeyPrompt,
  help,
  keyText,
  myResultsText,
  openPrompt,
  studentResult,
  submissionPreview,
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
const items = [
  ...Array.from({ length: 150 }, (_, i) => ({
    label: String(i + 1),
    kind: 'closed',
    key: ['a'],
    correctCount: 1,
    flag: i < 20 ? "Kuchli o'quvchilar ko'proq xato qilgan — kalit xato bo'lishi mumkin" : null,
  })),
  ...Array.from({ length: 60 }, (_, i) => ({
    label: `${151 + i}a`,
    kind: 'open',
    key: ['x<5', 'a&b'],
    correctCount: 0,
    flag: "Hech kim to'g'ri topmagan — kalitni tekshiring",
  })),
];

for (const n of [0, 2, 29, 31]) {
  test(`xabar shablonlari Telegram HTML ga mos (${n} qatnashchi)`, () => {
    const t = {
      name: evil.repeat(10).slice(0, 100),
      code: '12345',
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
      grade: k ? null : 'A+',
      rawScore: 3,
      correct: items.map((_, i) => (i % 3 ? 1 : 0)),
    }));
    const answers = items.map((it) => (it.kind === 'closed' ? 'b' : '<1&2>'));
    const texts = {
      welcome: welcome(evil),
      help: help(true),
      card: testSummary(t, n, 'bot'),
      key: keyText(t),
      closedPrompt: closedPrompt(t),
      openPrompt: openPrompt(items.filter((i) => i.kind === 'open').map((i) => i.label)),
      preview: submissionPreview(t, answers),
      summary: adminCloseSummary(t, subs),
      fix: fixKeyPrompt(t),
      myResults: myResultsText(subs.slice(0, 10).map((sub) => ({ test: t, sub }))),
    };
    if (n) texts.result = studentResult(t, subs[0]);
    for (const [name, text] of Object.entries(texts)) assertTelegramHtml(text, name);
  });
}
