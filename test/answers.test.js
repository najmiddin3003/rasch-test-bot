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
  labeledLine,
  parseClosed,
  parseOpenAnswers,
  parseOpenKey,
  stripLabelPrefix,
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

test("savol raqamidagi boshlang'ich nollar va kirill harf e'tiborga olinmaydi (07=c, 040а=...)", () => {
  const items = [
    { label: '7', kind: 'closed', options: 4 },
    { label: '40a', kind: 'open' },
  ];
  assert.deepEqual([...parseKeyFixes('07=c\n040а=ot', items).fixes.entries()], [
    ['7', ['c']],
    ['40a', ['ot']],
  ]);
  assert.deepEqual([...parseStudentFixes('07=b', items).fixes.entries()], [[0, 'b']]);
  assert.deepEqual(parseOpenKey('036=12', 35).items, [{ label: '36', key: ['12'] }]);
  assert.deepEqual(labeledLine(' 40 А) ta\'sir '), { label: '40a', value: "ta'sir" });
  assert.deepEqual(labeledLine('37='), { label: '37', value: '' });
  assert.equal(labeledLine('36-Qora'), null);
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

// O'qituvchi kalitni "36-Qora", "40-a)ta'sir...", "b)chunki" ko'rinishida kiritgan (#71776, #79410):
// raqamlar javobning bir qismi deb olinib, o'quvchilarning to'g'ri javoblari xato hisoblangan edi
const ONA_TILI_OPEN = ['36', '37', '38', '39', '40a', '40b', '41a', '41b', '42a', '42b', '43a', '43b', '44a', '44b'];

test("kalit: qator boshidagi savol raqami va a)/b) olib tashlanadi", () => {
  const typed = [
    '36-Qora', '37-,-', '38-da,ga', '39-Durust', "40-a)ta'sir ko'rsatadi", "b)so'rilishiga",
    '41- A) 2 va 3', 'B)1va4', '42-b)istihfom', "b)ritorik so'roq gap", '43-a)k;', 'b)muqayyad',
    '44-a) kamtarlik', 'b)kibrli, manman',
  ].join('\n');
  const parsed = parseKeyForLabels(typed, ONA_TILI_OPEN);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.items.map((i) => i.key[0]), [
    'Qora', ',-', 'da,ga', 'Durust', "ta'sir ko'rsatadi", "so'rilishiga", '2 va 3', '1va4', 'istihfom',
    "ritorik so'roq gap", 'k', 'muqayyad', 'kamtarlik', 'kibrli, manman',
  ]);
  // Raqamli va raqamsiz qatorlar aralash bo'lsa ham (soni to'g'ri) — tartib bo'yicha
  const mixed = parseKeyForLabels(typed.replace('36-Qora', '36) Qora'), ONA_TILI_OPEN);
  assert.equal(mixed.items[0].key[0], 'Qora');
});

test("kalit: qator boshqa savol raqami bilan boshlansa — tartib buzilgan", () => {
  const lines = ONA_TILI_OPEN.map((l, i) => `${l.replace(/[ab]$/, '')}-javob${i}`);
  lines[2] = '39-javob'; // 38-savol o'rnida 39
  const parsed = parseKeyForLabels(lines.join('\n'), ONA_TILI_OPEN);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /38-savol o'rnidagi qator "39"/);
  // Javobning o'zi raqam bilan boshlansa (savol raqami emas) — xato emas
  const answers = ONA_TILI_OPEN.map(() => 'x');
  answers[4] = '1-shaxs';
  assert.equal(parseKeyForLabels(answers.join('\n'), ONA_TILI_OPEN).items[4].key[0], '1-shaxs');
});

test("raqam olib tashlash javobning o'zini buzmaydi", () => {
  assert.equal(stripLabelPrefix('36.6', '36'), '36.6'); // o'nli kasr
  assert.equal(stripLabelPrefix('36-40', '36'), '36-40'); // oraliq
  assert.equal(stripLabelPrefix(',', '37'), ',');
  assert.equal(stripLabelPrefix(';', '37'), ';');
  assert.equal(stripLabelPrefix('-', '38'), '-');
  assert.equal(stripLabelPrefix('a)1va4, b)2va5', '41a'), '1va4, b)2va5');
  assert.equal(stripLabelPrefix('A k', '43a'), 'A k', "kalitda «A k» — harf so'zning bir qismi bo'lishi mumkin");
  assert.equal(stripLabelPrefix('A k', '43a', { bare: true }), 'k');
  assert.deepEqual(parseOpenKey('6-Toshkent\n7-8', 5).items.map((i) => i.key[0]), ['Toshkent', '7-8']);
});

test("tekshirish: o'quvchi javobidagi va eski kalitdagi savol raqami/harfi e'tiborga olinmaydi", () => {
  const items = [
    { label: '43a', kind: 'open', key: ['43-a)k'] }, // eski (tozalanmagan) kalit
    { label: '41b', kind: 'open', key: ['chunki'] },
    { label: '39', kind: 'open', key: ['39.5'] },
    { label: '37', kind: 'open', key: [','] },
  ];
  assert.deepEqual(checkAnswers(items, ['A k', 'b)chunki', '39.5', ',']), [1, 1, 1, 1]);
  assert.deepEqual(checkAnswers(items, ['43-a)k;', 'B chunki', '39.5', 'vergul']), [1, 1, 1, 1]);
  assert.deepEqual(checkAnswers(items, ['ak', 'chunkimi', '5', ';']), [0, 0, 0, 0], "ortiqcha qisqartirish yo'q");
});
