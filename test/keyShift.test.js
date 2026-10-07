import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKeyShift, keyShiftFlag } from '../src/lib/keyShift.js';

const open = (labels, keys) => labels.map((label, i) => ({ label, kind: 'open', key: [].concat(keys[i]) }));
const closed = (keys) => [...keys].map((k, i) => ({ label: String(i + 1), kind: 'closed', options: 4, key: [k] }));

/** n ta o'quvchi: to'g'ri javobni yozadi, ba'zilari (har 4-chisi) xato */
function students(n, truth, wrong = 'xato') {
  return Array.from({ length: n }, (_, s) => truth.map((a, j) => ((s + j) % 4 === 0 ? wrong : a)));
}

const TRUTH = ['dam', 'vergul', "horg'in", 'kiritma gap', 'qaratilgan', 'zidlov', 'undalma'];
const LABELS = ['36', '37', '38', '39', '40a', '40b', '41'];

test("yozma kalit: bitta ortiqcha qator va bitta tushib qolgan javob orasidagi savollar aniqlanadi", () => {
  // 37-javob ikki qatorga bo'lingan («vergul», «-»), «zidlov» tushib qolgan — #60548 dagi kabi
  const items = open(LABELS, ['dam', 'vergul', '-', "horg'in", 'kiritma gap', 'qaratilgan', 'undalma']);
  const shifts = detectKeyShift(items, students(12, TRUTH));
  assert.deepEqual(
    shifts.map((s) => `${items[s.index].label}→${items[s.neighbor].label}`),
    ['38→39', '39→40a', '40a→40b'],
  );
  assert.ok(shifts.every((s) => s.matches >= 8));
});

test("to'g'ri kalitda ogohlantirish yo'q", () => {
  assert.deepEqual(detectKeyShift(open(LABELS, TRUTH), students(30, TRUTH)), []);
});

test('kam qatnashchida (5 dan kam) tekshirilmaydi', () => {
  const items = open(LABELS, ['dam', 'vergul', '-', "horg'in", 'kiritma gap', 'qaratilgan', 'undalma']);
  assert.deepEqual(detectKeyShift(items, students(4, TRUTH)), []);
});

test("a/b javoblari almashib qolgani ikkala tomondan ko'rinadi", () => {
  const items = open(['40a', '40b'], ['kesim', 'ot']);
  const shifts = detectKeyShift(items, students(10, ['ot', 'kesim']));
  assert.deepEqual(
    shifts.map((s) => `${items[s.index].label}→${items[s.neighbor].label}`),
    ['40a→40b', '40b→40a'],
  );
});

test("yopiq kalit: tushib qolgan harfdan keyingi qator aniqlanadi", () => {
  const truth = 'abcdabcdab';
  // 3-harf tushib qolgan: kalit 3-savoldan boshlab bitta oldinga siljigan
  const items = closed(truth.slice(0, 2) + truth.slice(3) + 'a');
  const answers = students(15, [...truth], 'x').map((row) => row.map((a) => (a === 'x' ? '' : a)));
  const flagged = detectKeyShift(items, answers).map((s) => `${s.index + 1}→${s.neighbor + 1}`);
  assert.ok(flagged.length >= 6, flagged.join(', '));
  assert.ok(flagged.every((f) => /^(\d+)→(\d+)$/.test(f) && Number(f.split('→')[1]) === Number(f.split('→')[0]) - 1));
});

test("yopiq: bitta qiyin savolda ko'pchilik qo'shni kalitni belgilasa — ogohlantirilmaydi", () => {
  const truth = [...'abcdabcd'];
  const items = closed(truth.join(''));
  const answers = students(15, truth);
  // 4-savolga (kalit D) o'quvchilarning ko'pi C belgilagan (3-savol kaliti) — kuchli chalg'ituvchi variant
  answers.forEach((row, s) => {
    row[3] = s % 5 ? 'c' : 'd';
  });
  assert.deepEqual(detectKeyShift(items, answers), []);
});

test("«bilmayman» deb «-» yozilsa, qo'shni savol kaliti «-» (tire) bo'lsa ham ogohlantirilmaydi", () => {
  const items = open(['37', '38'], ['vergul', '-']);
  const answers = Array.from({ length: 10 }, (_, s) => [s < 6 ? '-' : 'vergul', s % 2 ? '-' : 'tire']);
  assert.deepEqual(detectKeyShift(items, answers), []);
});

test('izoh matni qo\'shni savol va kalitni ko\'rsatadi', () => {
  assert.equal(
    keyShiftFlag({ label: '39', kind: 'open', key: ["horg'in"] }, 9),
    "Kalit surilganga o'xshaydi: 9 kishi 39-savol kalitini («horg'in») yozgan",
  );
  assert.equal(
    keyShiftFlag({ label: '7', kind: 'closed', key: ['c'] }, 6),
    "Kalit surilganga o'xshaydi: 6 kishi 7-savol kalitini (C) belgilagan",
  );
});
