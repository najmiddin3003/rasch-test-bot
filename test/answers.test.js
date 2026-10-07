import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAnswers,
  checkClosedRange,
  parseEssay,
  parseKeyForLabels,
  parseStudentFixes,
  parseKeyFixes,
  isOpenCorrect,
  parseClosed,
  parseOpenAnswers,
  parseOpenKey,
  toNumber,
} from '../src/lib/answers.js';

test('yopiq kalit: ketma-ket format', () => {
  assert.deepEqual(parseClosed('abcd ABCD').answers, [...'abcdabcd']);
  assert.deepEqual(parseClosed('a,b,c,d').answers, [...'abcd']);
});

test('yopiq kalit: raqamli format', () => {
  assert.deepEqual(parseClosed('1a2b3c4d').answers, [...'abcd']);
  assert.deepEqual(parseClosed('1-a 2-b 3)c 4.d').answers, [...'abcd']);
  assert.deepEqual(parseClosed('1a 2b 3c 4d 5a 6b 7c 8d 9a 10b 11c').answers.length, 11);
  assert.deepEqual(parseClosed('3c 1a 2b').answers, [...'abc']);
});

test("yopiq kalit: kirill harflar lotinga o'giriladi", () => {
  assert.deepEqual(parseClosed('АВСД').answers, [...'abcd']);
  assert.deepEqual(parseClosed('абсд').answers, [...'abcd']);
});

test('yopiq kalit: xatolar', () => {
  assert.equal(parseClosed('abcz').ok, false);
  assert.equal(parseClosed('').ok, false);
  assert.match(parseClosed('1a2b4d').error, /3/);
  assert.match(parseClosed('1a1b').error, /ikki marta/);
});

test("o'quvchi javobi: soni tekshiriladi, x — javobsiz", () => {
  assert.equal(parseClosed('abc', { expected: 4, allowSkip: true }).ok, false);
  assert.deepEqual(parseClosed('abxd', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.deepEqual(parseClosed('ab-d', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.deepEqual(parseClosed('1a2b3x4d', { expected: 4, allowSkip: true }).answers, ['a', 'b', '', 'd']);
  assert.match(parseClosed('1a2b3c4d5a', { expected: 4, allowSkip: true }).error, /5/);
  assert.equal(parseClosed('abxd').ok, false, 'admin kalitida x mumkin emas');
});

test('ochiq kalit: raqamli va raqamsiz', () => {
  const labeled = parseOpenKey('36a=12\n36b) -3\n37 = 0.5;1/2', 35);
  assert.ok(labeled.ok);
  assert.deepEqual(labeled.items, [
    { label: '36a', key: ['12'] },
    { label: '36b', key: ['-3'] },
    { label: '37', key: ['0.5', '1/2'] },
  ]);
  const plain = parseOpenKey('12\n-3\n1.5', 35);
  assert.deepEqual(
    plain.items.map((i) => i.label),
    ['36', '37', '38'],
  );
  assert.deepEqual(plain.items[2].key, ['1.5']);
});

test('ochiq kalit: xatolar', () => {
  assert.equal(parseOpenKey('36a=12\n5', 35).ok, false, 'aralash format');
  assert.equal(parseOpenKey('36=1\n36=2', 35).ok, false, 'takror');
  assert.equal(parseOpenKey('30=1', 35).ok, false, 'yopiq raqam bilan to\'qnashuv');
});

test("o'quvchi ochiq javoblari", () => {
  const labels = ['36a', '36b', '37'];
  assert.deepEqual(parseOpenAnswers('12\n-3\n1/2', labels).answers, ['12', '-3', '1/2']);
  assert.deepEqual(parseOpenAnswers('36b=4\n37=-\n36a=1', labels).answers, ['1', '4', '']);
  assert.deepEqual(parseOpenAnswers('36а=1\n36б=4\n37=5', labels).answers, ['1', '4', '5'], 'kirill a/б');
  assert.equal(parseOpenAnswers('12\n-3', labels).ok, false);
  assert.equal(parseOpenAnswers('36a=1\n36b=2', labels).ok, false);
});

test('ochiq javoblarni solishtirish', () => {
  assert.ok(isOpenCorrect('0,5', ['0.5']));
  assert.ok(isOpenCorrect('1/2', ['0.5']));
  assert.ok(isOpenCorrect('.5', ['1/2']));
  assert.ok(isOpenCorrect(' -3 ', ['−3']));
  assert.ok(isOpenCorrect('+4', ['4']));
  assert.ok(isOpenCorrect('X = 5', ['x=5']));
  assert.ok(isOpenCorrect('Toshkent', ['toshkent']));
  assert.ok(!isOpenCorrect('', ['0']));
  assert.ok(!isOpenCorrect('3', ['4']));
  assert.equal(toNumber('2/0'), null);
  assert.equal(toNumber('abc'), null);
});

test('checkAnswers', () => {
  const items = [
    { kind: 'closed', key: ['a'] },
    { kind: 'closed', key: ['b'] },
    { kind: 'open', key: ['0.5', '1/2'] },
    { kind: 'open', key: ['12'] },
  ];
  assert.deepEqual(checkAnswers(items, ['a', 'c', '2/4', '']), [1, 0, 1, 0]);
});

test('kalitni tuzatish parseri', () => {
  const items = [
    { label: '7', kind: 'closed' },
    { label: '31a', kind: 'open' },
  ];
  const ok = parseKeyFixes('7=C\n31а = 12;12.0', items);
  assert.ok(ok.ok);
  assert.deepEqual([...ok.fixes.entries()], [
    ['7', ['c']],
    ['31a', ['12', '12.0']],
  ]);
  assert.match(parseKeyFixes('8=c', items).error, /yo'q/);
  assert.match(parseKeyFixes('7=cd', items).error, /bitta harf/);
  assert.equal(parseKeyFixes('salom', items).ok, false);
});

test("xato matnlarida foydalanuvchi kiritgan < va & bo'lishi mumkin (HTML escape talab qilinadi)", () => {
  const err = parseClosed('1a 2b <3c', { expected: 3, allowSkip: true }).error;
  assert.ok(err.includes('<'), 'xato matni xom kiritmani o\'z ichiga oladi — botda escapeHtml shart');
});

test("tutuq belgisi: barcha ko'rinishlari va «tutuq belgisi» so'zi teng", () => {
  const variants = ["'", '`', '‘', '’', 'ʻ', 'ʼ', '´', 'tutuq belgisi', 'Tutuq  belgisi', 'tutuq'];
  for (const a of variants) for (const k of ["'", 'ʼ', 'tutuq belgisi']) assert.ok(isOpenCorrect(a, [k]), `${a} ~ ${k}`);
  assert.ok(isOpenCorrect("o'zbek", ['o‘zbek']));
  assert.ok(isOpenCorrect('ma`no', ['maʼno']));
  assert.ok(isOpenCorrect("g'oya", ['gʻoya']));
});

test("tire: barcha ko'rinishlari va «tire» so'zi teng, «chiziqcha» so'zi emas", () => {
  for (const a of ['-', '–', '—', '−', 'tire', 'TIRE']) for (const k of ['—', '-', 'tire']) assert.ok(isOpenCorrect(a, [k]), `${a} ~ ${k}`);
  assert.ok(!isOpenCorrect('chiziqcha', ['tire']));
});

test("tinish belgilari so'z bilan va nuqtaning o'zi", () => {
  assert.ok(isOpenCorrect('.', ['.']), "javobning o'zi nuqta bo'lsa bo'sh qolmasligi kerak");
  assert.ok(isOpenCorrect('nuqta', ['.']));
  assert.ok(isOpenCorrect('vergul', [',']));
  assert.ok(isOpenCorrect('ikki nuqta', [':']));
  assert.ok(isOpenCorrect("ko'p nuqta", ['...']));
  assert.ok(isOpenCorrect('«', ["qo'shtirnoq"]));
  assert.ok(!isOpenCorrect('vergul', ['.']));
  assert.ok(isOpenCorrect('Toshkent.', ['toshkent']));
});

test('shablon kaliti: tartib bilan yoki raqami bilan, muqobillar ; bilan', () => {
  const labels = ['36', '37', '40a', '40b'];
  const plain = parseKeyForLabels("o'g'il;bola\n12\ntire\n-", labels);
  assert.ok(plain.ok);
  assert.deepEqual(plain.items[0], { label: '36', key: ["o'g'il", 'bola'] });
  const labeled = parseKeyForLabels('40b=2\n36=a\n37=b\n40a=1', labels);
  assert.deepEqual(labeled.items.map((i) => i.key[0]), ['a', 'b', '1', '2']);
  assert.match(parseKeyForLabels('a\nb', labels).error, /4 ta javob/);
  assert.match(parseKeyForLabels('36=a\n37=b\n40a=1', labels).error, /40b/);
  assert.match(parseKeyForLabels('36=a\n37=b\n40a=1\n41=2', labels).error, /bunday savol yo'q/);
});

test('variantlar oralig\'i: 1–32 A–D, 33–35 A–F', () => {
  const options = [...Array(32).fill(4), 6, 6, 6];
  const ok = [...'abcd'.repeat(8), 'e', 'f', 'a'];
  assert.equal(checkClosedRange(ok, options), null);
  const bad = [...ok];
  bad[3] = 'e';
  assert.match(checkClosedRange(bad, options), /4-savolda faqat A–D/);
  assert.equal(checkClosedRange(['', 'a'], [4, 4]), null, 'javobsiz savol xato emas');
});

test('esse bali: 0–75, vergul ham mumkin', () => {
  assert.equal(parseEssay('58'), 58);
  assert.equal(parseEssay('61,5'), 61.5);
  assert.equal(parseEssay('0'), 0);
  assert.equal(parseEssay('75'), 75);
  for (const bad of ['76', '-1', 'abc', '', '5 ball']) assert.equal(parseEssay(bad), null, bad);
});

test("o'quvchi tasdiqlashdan oldin javobini tuzatadi", () => {
  const items = [
    { label: '1', kind: 'closed', options: 4 },
    { label: '33', kind: 'closed', options: 6 },
    { label: '36', kind: 'open' },
    { label: '40a', kind: 'open' },
  ];
  const r = parseStudentFixes("1=C\n33=f\n36=o'g'il bola\n40a=\nesse=61,5", items, { hasEssay: true });
  assert.ok(r.ok);
  assert.deepEqual([...r.fixes], [[0, 'c'], [1, 'f'], [2, "o'g'il bola"], [3, '']]);
  assert.equal(r.essay, 61.5);
  assert.deepEqual([...parseStudentFixes('1=x', items).fixes], [[0, '']], 'x — javobni olib tashlash');
  assert.match(parseStudentFixes('1=e', items).error, /A–D/);
  assert.match(parseStudentFixes('esse=60', items).error, /esse yo'q/);
  assert.match(parseStudentFixes('99=a', items).error, /savoli yo'q/);
});

test("tuzatishda «-» — tire javobi (o'chirilmaydi), «;» — kalitda nuqtali vergulning o'zi", () => {
  const items = [{ label: '37', kind: 'open' }];
  assert.deepEqual([...parseStudentFixes('37=-', items).fixes], [[0, '-']]);
  assert.deepEqual([...parseStudentFixes('37=', items).fixes], [[0, '']]);
  assert.deepEqual(parseKeyForLabels(';', ['36']).items, [{ label: '36', key: [';'] }]);
  assert.deepEqual(parseOpenKey('11=;', 10).items, [{ label: '11', key: [';'] }]);
  assert.deepEqual([...parseKeyFixes('36=;', [{ label: '36', kind: 'open' }]).fixes], [['36', [';']]]);
  assert.ok(isOpenCorrect(';', ['nuqtali vergul']));
  assert.ok(isOpenCorrect('nuqtali vergul', [';']));
});

test('eski testlar: variantlar soni kalit harfidan aniqlanadi', async () => {
  const { itemOptions } = await import('../src/lib/formats.js');
  assert.equal(itemOptions({ key: ['b'] }), 4);
  assert.equal(itemOptions({ key: ['e'] }), 6);
  assert.equal(itemOptions({ key: ['f'] }), 6);
  assert.equal(itemOptions({ options: 5, key: ['a'] }), 5);
  assert.deepEqual([...parseStudentFixes('33=e', [{ label: '33', kind: 'closed', key: ['e'] }]).fixes], [[0, 'e']]);
});
